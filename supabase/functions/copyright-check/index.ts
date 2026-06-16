// copyright-check: download the final video (and optional music/voiceover),
// send them to Gemini multimodal, and return a structured copyright-risk
// assessment with separate verdicts + reasons for the video and the music.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";

const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25MB cap (inline base64)
const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15MB cap for audio

const ANALYSIS_PROMPT = `You are a strict copyright & content-rights reviewer for short marketing/social videos.
You receive a VIDEO and, optionally, a MUSIC track and/or a VOICEOVER track.
Carefully inspect EVERYTHING and assess copyright / trademark / right-of-publicity risk.

For the VIDEO, look for: recognizable brand logos or trademarks, copyrighted
characters or mascots, recognizable clips from known films/series/games,
celebrity likeness, on-screen watermarks, or copyrighted artwork.

For the MUSIC, judge whether it sounds like a known commercial/copyrighted song
(melody, hook, lyrics, recognizable artist) versus generic/royalty-free/AI-generated
music that is safe to use. If only a voiceover is present (speech, no song),
treat it as low risk unless it quotes copyrighted material.

Respond with ONLY a compact JSON object using EXACTLY this shape:

{
  "verdict": "approved" | "caution" | "rejected",
  "summary": "1-2 sentence overall conclusion",
  "video": {
    "status": "approved" | "caution" | "rejected",
    "reason": "clear, specific explanation of why",
    "risks": ["short risk item", "..."]
  },
  "music": {
    "status": "approved" | "caution" | "rejected" | "not_provided",
    "reason": "clear, specific explanation of why",
    "risks": ["short risk item", "..."]
  }
}

Rules:
- "approved" = no meaningful copyright risk found.
- "caution" = possible/uncertain risk that a human should review.
- "rejected" = clear copyrighted/trademarked material detected.
- The top-level "verdict" must be the WORST of the two section statuses
  (rejected > caution > approved; ignore "not_provided").
- Be concrete and honest. If you are unsure, use "caution", never invent details.
- No markdown, no preamble, only the JSON object.`;

function isAllowedUrl(u: string): boolean {
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

async function fetchInline(url: string, cap: number, fallbackMime: string) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${resp.status}`);
  const mimeType = resp.headers.get("content-type") || fallbackMime;
  const buf = new Uint8Array(await resp.arrayBuffer());
  if (buf.byteLength > cap) throw new Error("too_large");
  return { mimeType, data: toBase64(buf) };
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
    const musicUrl: string = typeof body?.musicUrl === "string" ? body.musicUrl.trim() : "";
    const voiceoverUrl: string = typeof body?.voiceoverUrl === "string" ? body.voiceoverUrl.trim() : "";

    if (!videoUrl || !isAllowedUrl(videoUrl)) {
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

    // Build the multimodal parts.
    const parts: Array<Record<string, unknown>> = [];

    try {
      const v = await fetchInline(videoUrl, MAX_VIDEO_BYTES, "video/mp4");
      parts.push({ inlineData: { mimeType: v.mimeType, data: v.data } });
      parts.push({ text: "The above is the VIDEO to review." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = msg === "too_large" ? 413 : 502;
      return new Response(JSON.stringify({ error: msg === "too_large" ? "Video too large to analyze (>25MB)" : "Could not fetch video" }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let musicProvided = false;
    if (musicUrl && isAllowedUrl(musicUrl)) {
      try {
        const m = await fetchInline(musicUrl, MAX_AUDIO_BYTES, "audio/mpeg");
        parts.push({ inlineData: { mimeType: m.mimeType, data: m.data } });
        parts.push({ text: "The above audio is the MUSIC track for this video." });
        musicProvided = true;
      } catch (e) {
        console.warn("copyright-check music fetch failed", e);
      }
    }

    if (voiceoverUrl && isAllowedUrl(voiceoverUrl)) {
      try {
        const vo = await fetchInline(voiceoverUrl, MAX_AUDIO_BYTES, "audio/mpeg");
        parts.push({ inlineData: { mimeType: vo.mimeType, data: vo.data } });
        parts.push({ text: "The above audio is the VOICEOVER track for this video." });
      } catch (e) {
        console.warn("copyright-check voiceover fetch failed", e);
      }
    }

    if (!musicProvided) {
      parts.push({ text: "No separate MUSIC track was provided. Judge the music section as \"not_provided\" unless music is clearly audible inside the video itself." });
    }

    parts.push({ text: ANALYSIS_PROMPT });

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
      },
    );

    if (!geminiResp.ok) {
      const t = await geminiResp.text().catch(() => "");
      console.error("copyright-check gemini error", geminiResp.status, t);
      return new Response(JSON.stringify({ error: `Analysis service error (${geminiResp.status})` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await geminiResp.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(text);
    } catch {
      result = {
        verdict: "caution",
        summary: text.slice(0, 500) || "Could not parse the analysis result.",
        video: { status: "caution", reason: "Unstructured result returned.", risks: [] },
        music: { status: "not_provided", reason: "", risks: [] },
      };
    }

    return new Response(JSON.stringify({ result }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("copyright-check unhandled", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
