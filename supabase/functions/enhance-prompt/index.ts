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

// Allowed camera styles + a short cinematic definition of each, so the model
// knows exactly how to weave the movement into the rewritten prompt.
const CAMERA_STYLES: Record<string, string> = {
  "Whip Pan": "an extremely fast horizontal pan that creates motion blur, used as a snappy transition or to reveal a new subject",
  "Orbit Shot": "a smooth 360-degree camera orbit revolving around the subject, keeping it centered while the background sweeps by",
  "FPV Drone": "an immersive first-person-view drone flight with fast, fluid, sweeping aerial movement that dives, climbs and weaves through the scene",
  "Tracking Shot": "the camera smoothly follows the moving subject, holding it in frame as it travels through the environment",
  "Push In Cinematic": "a slow, deliberate dolly push-in toward the subject that builds tension and emotional intensity",
  "Fly Through": "the camera flies continuously through the environment, passing through openings, gaps and spaces in one unbroken move",
  "Crash Zoom": "a sudden, aggressive rapid zoom-in onto the subject for dramatic, punchy emphasis",
  "Handheld Dynamic": "energetic handheld camera work with natural shake and reactive movement for a raw, documentary, in-the-moment feel",
  "Dolly Zoom": "the vertigo effect — dolly the camera while zooming the opposite direction so the background warps while the subject stays the same size",
  "Parallax Motion": "a lateral camera move that creates strong depth as foreground and background layers slide past each other at different speeds",
};

function cameraSuffix(style: string, definition: string): string {
  return [
    `CAMERA STYLE DIRECTIVE: Rewrite and enrich the prompt as a single cinematic`,
    `video prompt built around the "${style}" camera movement, which is:`,
    `${definition}.`,
    `Weave this camera movement naturally into the scene and describe how the`,
    `camera moves. Keep the original subject, action, setting and mood, and add`,
    `vivid detail (subject, action, environment, lighting, mood) so the scenario`,
    `feels complete and cinematic.`,
    `CRITICAL: Output the rewritten prompt in ENGLISH ONLY, regardless of the`,
    `input language. Translate everything to natural English. Keep it under 90 words.`,
  ].join(" ");
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
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const mode: "silent" | "narrated" | "camera" | null =
      body?.mode === "silent" || body?.mode === "narrated" || body?.mode === "camera"
        ? body.mode
        : null;
    const cameraStyle: string =
      typeof body?.cameraStyle === "string" ? body.cameraStyle.trim() : "";
    const narratorScript: string =
      typeof body?.narratorScript === "string" ? body.narratorScript.trim() : "";
    const rawUrls: unknown = body?.imageUrls;
    // SSRF protection: only allow https URLs from our own Supabase storage host
    // (user-images, wan-frames, merged-videos buckets) and known public CDNs.
    const supabaseHost = (() => {
      try { return new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname; } catch { return ""; }
    })();
    const ALLOWED_IMG_HOST_SUFFIXES = [
      supabaseHost,
      ".supabase.co",
      ".supabase.in",
    ].filter(Boolean);
    const isAllowedImageUrl = (u: string): boolean => {
      try {
        const p = new URL(u);
        if (p.protocol !== "https:") return false;
        const h = p.hostname.toLowerCase();
        return ALLOWED_IMG_HOST_SUFFIXES.some((s) =>
          s.startsWith(".") ? h.endsWith(s) : h === s
        );
      } catch {
        return false;
      }
    };
    const imageUrls: string[] = Array.isArray(rawUrls)
      ? rawUrls
          .filter((u): u is string => typeof u === "string")
          .map((u) => u.trim())
          .filter(isAllowedImageUrl)
          .slice(0, 4)
      : [];


    if (!prompt && mode !== "narrated") {
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
    if (mode === "narrated") {
      if (!narratorScript) {
        return new Response(JSON.stringify({ error: "narratorScript is required when mode=narrated" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (narratorScript.length > 1500) {
        return new Response(JSON.stringify({ error: "narratorScript too long (max 1500 chars)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    const systemPrompt = `${BASE_SYSTEM_PROMPT}\n\n${
      mode === "silent"
        ? SILENT_SUFFIX
        : mode === "narrated"
          ? narratedSuffix(narratorScript)
          : DEFAULT_SUFFIX
    }`;

    // For narrated mode with no user prompt, seed with the script so the model
    // has something to anchor the visual scene to.
    const effectivePrompt = prompt || (mode === "narrated"
      ? `Cinematic short scene built around this narrator script: "${narratorScript}"`
      : "");


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
          { type: "text", text: effectivePrompt },
          ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
        ]
      : effectivePrompt;

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
          { role: "system", content: systemPrompt },
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
