// video-analyze: download the source video, send to Gemini multimodal,
// return a structured scene analysis used to enrich the V2V edit prompt.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { readJsonLoose } from "../_shared/core/safe-json.ts";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB cap (inline base64)

const ANALYSIS_PROMPT = `You are analyzing a short video so a downstream image-to-video model can recreate it
with a SMALL targeted edit while preserving everything else. Watch the entire clip
carefully and respond with ONLY a compact JSON object using this exact shape:

{
  "summary": "2-3 sentence overall description of what happens",
  "subjects": "main subjects, their appearance, clothing, identity cues",
  "camera": "framing, angle, lens feel, any camera movement",
  "motion": "what moves and how (subject motion, action beats, pacing)",
  "lighting": "key light direction, color, time of day, mood",
  "environment": "setting, background, props, atmosphere",
  "key_moments": "ordered list of 2-5 beats across the clip, comma-separated"
}

Be concrete and visual. No markdown, no preamble, only the JSON object.`;

function isAllowedVideoUrl(u: string): boolean {
  try {
    const p = new URL(u);
    if (p.protocol !== "https:") return false;
    const h = p.hostname.toLowerCase();
    const supabaseHost = (() => {
      try { return new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname; } catch { return ""; }
    })();
    const allowed = [supabaseHost, ".supabase.co", ".supabase.in"].filter(Boolean);
    return allowed.some((s) => s.startsWith(".") ? h.endsWith(s) : h === s);
  } catch { return false; }
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await authenticate(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const videoUrl: string = typeof body?.videoUrl === "string" ? body.videoUrl.trim() : "";
    if (!videoUrl || !isAllowedVideoUrl(videoUrl)) {
      return new Response(JSON.stringify({ error: "videoUrl is required and must be a Supabase storage URL" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download the video.
    const videoResp = await fetch(videoUrl);
    if (!videoResp.ok) {
      return new Response(JSON.stringify({ error: `Could not fetch video (${videoResp.status})` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const mimeType = videoResp.headers.get("content-type") || "video/mp4";
    const buf = new Uint8Array(await videoResp.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "Video too large to analyze (>25MB)" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const b64 = toBase64(buf);

    // Call Gemini directly (multimodal video understanding).
    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType, data: b64 } },
              { text: ANALYSIS_PROMPT },
            ],
          }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
      },
    );

    if (!geminiResp.ok) {
      const t = await geminiResp.text().catch(() => "");
      console.error("video-analyze gemini error", geminiResp.status, t);
      return new Response(JSON.stringify({ error: `Gemini error (${geminiResp.status})` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await readJsonLoose(geminiResp, "video-analyze");
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    try { analysis = JSON.parse(text); } catch {
      // Fallback: wrap raw text as summary.
      analysis = { summary: text.slice(0, 2000) };
    }

    return new Response(JSON.stringify({ analysis }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("video-analyze unhandled", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
