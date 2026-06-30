// write-image-prompt edge function: drafts a single polished, professional
// image-generation prompt from optional reference images (base64 data URLs)
// and a chosen visual theme, using the Lovable AI Gateway.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";

const MAX_REFERENCES = 4;

const SYSTEM_PROMPT = [
  "You are an expert prompt engineer for AI image-generation models.",
  "If one or more reference images are attached, FIRST silently analyze each",
  "(subject, product, materials, lighting, composition, colors, mood, key details)",
  "and then write a single vivid, concrete image prompt that faithfully preserves",
  "the subject/product identity while producing a highly professional result.",
  "If a visual theme/style is provided, incorporate its aesthetic naturally.",
  "If the user already typed some prompt text, build on its intent and keep its language.",
  "Default to English when there is no existing text to mirror.",
  "Output ONLY the final prompt — no preamble, no quotes, no explanation,",
  "no markdown, no labels. Keep it under 110 words.",
].join(" ");

const AD_COPY_RULES = [
  "Additionally, the image is a product advertisement: include in the prompt a short,",
  "legible ADVERTISING HEADLINE/TAGLINE composited onto the image with tasteful,",
  "well-placed, readable typography that fits the composition and aspect ratio.",
  "Describe the exact tagline text in quotes so it renders on the image.",
  "STRICT rules for that on-image text: keep it purely promotional and brand/mood-driven",
  "(a few words, max ~6). It MUST NOT make any factual or performance claim",
  "(no 'best', 'strongest', '#1', 'certified', no specs/numbers stated as fact)",
  "and MUST NOT contain any guarantee or warranty wording",
  "(no 'guaranteed', 'warranty', '100%', 'risk-free', 'lifetime').",
  "Write the tagline in the same language as the existing prompt text; English by default.",
].join(" ");


function isDataUrl(u: string): boolean {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(u);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const themeDescriptor =
      typeof body?.themeDescriptor === "string" ? body.themeDescriptor.trim().slice(0, 600) : "";
    const themeLabel =
      typeof body?.themeLabel === "string" ? body.themeLabel.trim().slice(0, 120) : "";
    const existingPrompt =
      typeof body?.existingPrompt === "string" ? body.existingPrompt.trim().slice(0, 2000) : "";
    const includeAdCopy = body?.includeAdCopy === true;
    const productName =
      typeof body?.productName === "string" ? body.productName.trim().slice(0, 120) : "";
    const referenceImages: string[] = Array.isArray(body?.referenceImages)
      ? body.referenceImages
          .filter((u: unknown): u is string => typeof u === "string")
          .filter(isDataUrl)
          .slice(0, MAX_REFERENCES)
      : [];

    if (referenceImages.length === 0 && !themeDescriptor && !existingPrompt) {
      return new Response(
        JSON.stringify({ error: "Add a reference image, a product, a theme, or some prompt text first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instructionParts: string[] = [];
    if (existingPrompt) {
      instructionParts.push(`The user's current prompt draft / intent: "${existingPrompt}".`);
    }
    if (themeDescriptor || themeLabel) {
      instructionParts.push(
        `Apply this visual theme: ${themeLabel ? themeLabel + " — " : ""}${themeDescriptor}.`,
      );
    }
    if (referenceImages.length > 0) {
      instructionParts.push(
        "Write the prompt for the attached reference image(s); preserve the product/subject exactly.",
      );
    }
    instructionParts.push("Write the final professional image prompt now.");
    const instruction = instructionParts.join(" ");

    const userContent: unknown =
      referenceImages.length > 0
        ? [
            { type: "text", text: instruction },
            ...referenceImages.map((url) => ({ type: "image_url", image_url: { url } })),
          ]
        : instruction;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (resp.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit reached. Try again in a moment." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (resp.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Add credits to continue." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("write-image-prompt gateway error", resp.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const raw: string = (data?.choices?.[0]?.message?.content ?? "").trim();
    if (!raw) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const cleaned = raw.replace(/^["'`]+|["'`]+$/g, "").trim();

    return new Response(JSON.stringify({ prompt: cleaned }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("write-image-prompt unhandled error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
