// inspect-cover-text edge function (the "Guardian"): reads any text baked onto a
// generated cover image (OCR via a vision model), then judges whether that text
// is appropriate and suitable for an advertising cover. Returns structured JSON.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { readJsonLoose } from "../_shared/core/safe-json.ts";

const SYSTEM_PROMPT = [
  "You are a strict cover-text guardian for advertising/cover images.",
  "You receive ONE image. Carefully read ALL text that is visibly composited on the image",
  "(headlines, taglines, captions, logos-as-text, watermarks).",
  "Then judge whether that on-image text is appropriate and suitable for a marketing cover.",
  "Guardrails for a GOOD cover text: it must be purely promotional, brand/mood-driven, short and legible.",
  "It is INAPPROPRIATE if it: makes factual or performance claims ('best', '#1', 'strongest', 'certified', specs/numbers stated as fact),",
  "contains guarantee/warranty wording ('guaranteed', 'warranty', '100%', 'risk-free', 'lifetime'),",
  "is offensive, misleading, contains personal/contact data, gibberish, misspellings, or is unreadable.",
  "Respond with ONLY a single minified JSON object, no markdown, no code fences, with EXACTLY these keys:",
  '{"hasText": boolean, "text": string, "language": string, "isAppropriate": boolean, "isAdSuitable": boolean, "reason": string, "suggestions": string[]}.',
  "\"text\" is the verbatim extracted on-image text ('' if none).",
  "\"language\" is the BCP-47-ish language name of the text (e.g. 'English', 'Persian', or '' if none).",
  "\"reason\" is one short sentence explaining the verdict.",
  "\"suggestions\" is up to 3 short improved promotional alternative taglines (empty array if the text is already great or there is no text).",
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
    const image = typeof body?.image === "string" ? body.image : "";
    if (!image || !isDataUrl(image)) {
      return new Response(JSON.stringify({ error: "A base64 image data URL is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
          {
            role: "user",
            content: [
              { type: "text", text: "Read the on-image text and evaluate it. Return only the JSON object." },
              { type: "image_url", image_url: { url: image } },
            ],
          },
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
      console.error("inspect-cover-text gateway error", resp.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await readJsonLoose(resp, "inspect-cover-text");
    const raw: string = (data?.choices?.[0]?.message?.content ?? "").trim();
    if (!raw) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strip any accidental code fences, then parse the JSON object.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    let parsed: Record<string, unknown>;
    try {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      parsed = JSON.parse(start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned);
    } catch {
      console.error("inspect-cover-text parse error", cleaned);
      return new Response(JSON.stringify({ error: "Could not parse AI response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = {
      hasText: Boolean(parsed.hasText),
      text: typeof parsed.text === "string" ? parsed.text : "",
      language: typeof parsed.language === "string" ? parsed.language : "",
      isAppropriate: Boolean(parsed.isAppropriate),
      isAdSuitable: Boolean(parsed.isAdSuitable),
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.filter((s: unknown): s is string => typeof s === "string").slice(0, 3)
        : [],
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("inspect-cover-text unhandled error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
