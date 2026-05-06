// Enhance-prompt edge function: rewrites the user's video-generation prompt
// into a polished, cinematic version using the Lovable AI Gateway.
// If the user attached one or more images (Start/End frames), the AI will
// FIRST analyze the image(s) and THEN write the prompt for that exact image,
// preserving subject identity and adding camera/motion/mood.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";

const BASE_SYSTEM_PROMPT = [
  "You are an expert prompt engineer for AI video generation models",
  "(image-to-video and text-to-video).",
  "If one or more images are attached, FIRST silently analyze each image",
  "(subject, composition, lighting, colors, style, key details) and then",
  "write a single cinematic video prompt for THAT EXACT image: keep the",
  "subject's identity, setting, palette, and style intact, and add the",
  "scene/action, camera motion, lighting, and mood implied by the user's text.",
  "If no image is attached, just rewrite the user's text into a single,",
  "vivid, cinematic, concrete prompt with subject, action, setting,",
  "lighting, camera motion, and mood when relevant.",
  "Preserve the user's original language exactly (Persian stays Persian,",
  "English stays English, etc.).",
  "Output ONLY the rewritten prompt — no preamble,",
  "no quotes, no explanation, no markdown.",
].join(" ");

const SILENT_SUFFIX = [
  "CRITICAL CONSTRAINT: The generated video MUST contain absolutely no narrator,",
  "no voice-over, no spoken dialogue, no character speaking on camera, and no",
  "lip movement. Do NOT describe any speech, narration, or talking. Visual",
  "storytelling and ambient/music sound design only. Explicitly include the",
  "phrase 'no narration, no dialogue, no voice-over, no talking, no lip-sync'",
  "inside the rewritten prompt. Keep it under 80 words.",
].join(" ");

function narratedSuffix(script: string): string {
  return [
    "The generated video MUST feature a narrator (voice-over or on-camera",
    "speaker) reading the following script verbatim. Build the visual scene,",
    "pacing, camera, and mood to match these exact words. Inside the rewritten",
    "prompt, include a clear directive such as 'voice-over narration delivering",
    "the following script:' followed by the script in its original language and",
    "wording, kept intact between quotes. Keep the rest of the prompt vivid and",
    "cinematic. The total output may be up to 130 words.",
    `\n\nNARRATOR SCRIPT:\n"""${script}"""`,
  ].join(" ");
}

const DEFAULT_SUFFIX = "Keep it under 80 words.";


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
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const rawUrls: unknown = body?.imageUrls;
    const imageUrls: string[] = Array.isArray(rawUrls)
      ? rawUrls
          .filter((u): u is string => typeof u === "string")
          .map((u) => u.trim())
          .filter((u) => /^https?:\/\//i.test(u))
          .slice(0, 4)
      : [];

    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (prompt.length > 4000) {
      return new Response(JSON.stringify({ error: "prompt too long" }), {
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

    // Build user message: multimodal when images are present, plain text otherwise.
    const userContent: unknown = imageUrls.length > 0
      ? [
          { type: "text", text: prompt },
          ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
        ]
      : prompt;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // gemini-2.5-flash supports vision and is fast/cheap.
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Try again in a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits to continue." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("enhance-prompt gateway error", resp.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const enhanced: string = (data?.choices?.[0]?.message?.content ?? "").trim();
    if (!enhanced) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strip surrounding quotes if the model added them despite instructions.
    const cleaned = enhanced.replace(/^["'`]+|["'`]+$/g, "").trim();

    return new Response(JSON.stringify({ enhancedPrompt: cleaned }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("enhance-prompt unhandled error", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
