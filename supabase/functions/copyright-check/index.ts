// copyright-check: download the final film (and optional music/voiceover),
// send them to Gemini multimodal, and return a structured copyright RISK
// assessment (approved / caution / rejected) with reasons for video + audio.
//
// IMPORTANT: This is a heuristic RISK assessment, NOT a legal guarantee and
// NOT a match against any copyright database. It flags visible/audible signals
// (logos, brand marks, watermarks, recognizable characters, obvious likeness
// to commercial works) so the user can review before publishing.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25MB cap (inline base64)
const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15MB cap (inline base64)

const ANALYSIS_PROMPT = `You are a copyright-risk reviewer for a short marketing/social video.
You CANNOT match content against any copyright database, so do NOT claim certainty.
Instead, assess the RISK that this video or its audio could trigger a copyright
or trademark claim, based on what you can actually see and hear.

Look for concrete signals such as:
- VIDEO: visible third-party brand logos, trademarks, product packaging, recognizable
  copyrighted characters/mascots, on-screen watermarks, footage that looks like it was
  ripped from a known film/TV show/ad, recognizable celebrities or public figures.
- AUDIO: music that closely resembles a well-known commercial song, recognizable
  melodies/hooks, a voice imitating a famous person, or sampled/branded audio.

Verdict rules:
- "approved": no notable third-party IP signals detected; appears safe to publish.
- "caution": some signals that MIGHT be third-party IP and deserve human review.
- "rejected": clear/strong signals of third-party IP that likely cause a claim.

Respond with ONLY a compact JSON object using EXACTLY this shape:

{
  "verdict": "approved" | "caution" | "rejected",
  "video": { "verdict": "approved" | "caution" | "rejected", "reason": "1-2 sentences", "signals": "comma-separated concrete observations, or 'none'" },
  "audio": { "verdict": "approved" | "caution" | "rejected", "reason": "1-2 sentences", "signals": "comma-separated concrete observations, or 'none'" },
  "overallReason": "2-3 sentence summary explaining the overall verdict",
  "recommendations": "comma-separated, actionable steps to reduce risk, or 'none'"
}

The overall "verdict" must be the most severe of video.verdict and audio.verdict.
If no audio is provided, set audio.verdict to "approved" and audio.reason to "No music or voiceover was provided.".
No markdown, no preamble, only the JSON object.`;

function isAllowedStorageUrl(u: string): boolean {
  try {
    const p = new URL(u);
    if (p.protocol !== "https:") return false;
    const h = p.hostname.toLowerCase();
    const supabaseHost = (() => {
      try { return new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname; } catch { return ""; }
    })();
    const allowed = [supabaseHost, ".supabase.co", ".supabase.in"].filter(Boolean);
    return allowed.some((s) => (s.startsWith(".") ? h.endsWith(s) : h === s));
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

// Parse a Supabase storage URL into { bucket, path } so we can download via the
// service role even for private buckets (merged-videos, user-audio).
function parseStorage(u: string): { bucket: string; path: string } | null {
  try {
    const parsed = new URL(u);
    const m = parsed.pathname.match(
      /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/(.+)$/,
    );
    if (!m) return null;
    let path = m[2];
    try { path = decodeURIComponent(path); } catch { /* keep raw */ }
    return { bucket: m[1], path };
  } catch { return null; }
}

async function downloadMedia(
  admin: ReturnType<typeof createClient>,
  url: string,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; mimeType: string } | { error: string; status: number }> {
  // Prefer service-role storage download (works for private buckets).
  const loc = parseStorage(url);
  if (loc) {
    const { data, error } = await admin.storage.from(loc.bucket).download(loc.path);
    if (!error && data) {
      const buf = new Uint8Array(await data.arrayBuffer());
      if (buf.byteLength > maxBytes) return { error: "Media too large to analyze", status: 413 };
      return { bytes: buf, mimeType: data.type || "application/octet-stream" };
    }
  }
  // Fallback: direct fetch (e.g. already-signed/public URL).
  const resp = await fetch(url);
  if (!resp.ok) return { error: `Could not fetch media (${resp.status})`, status: 502 };
  const mimeType = resp.headers.get("content-type") || "application/octet-stream";
  const buf = new Uint8Array(await resp.arrayBuffer());
  if (buf.byteLength > maxBytes) return { error: "Media too large to analyze", status: 413 };
  return { bytes: buf, mimeType };
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
    const musicName: string = typeof body?.musicName === "string" ? body.musicName.trim() : "";
    const voiceoverName: string = typeof body?.voiceoverName === "string" ? body.voiceoverName.trim() : "";

    if (!videoUrl || !isAllowedStorageUrl(videoUrl)) {
      return new Response(JSON.stringify({ error: "videoUrl is required and must be a storage URL" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Download the final video.
    const video = await downloadMedia(admin, videoUrl, MAX_VIDEO_BYTES);
    if ("error" in video) {
      return new Response(JSON.stringify({ error: video.error }), {
        status: video.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parts: unknown[] = [
      { inlineData: { mimeType: video.mimeType.startsWith("video/") ? video.mimeType : "video/mp4", data: toBase64(video.bytes) } },
    ];

    // Optional audio tracks (best-effort: skip silently if download fails).
    let hasAudio = false;
    const audioContext: string[] = [];
    for (const [url, label, name] of [
      [musicUrl, "MUSIC", musicName],
      [voiceoverUrl, "VOICEOVER", voiceoverName],
    ] as const) {
      if (!url || !isAllowedStorageUrl(url)) continue;
      const media = await downloadMedia(admin, url, MAX_AUDIO_BYTES);
      if ("error" in media) continue;
      hasAudio = true;
      audioContext.push(`${label}${name ? ` ("${name}")` : ""}`);
      parts.push({
        inlineData: {
          mimeType: media.mimeType.startsWith("audio/") ? media.mimeType : "audio/mpeg",
          data: toBase64(media.bytes),
        },
      });
    }

    const promptText = hasAudio
      ? `${ANALYSIS_PROMPT}\n\nThe attached audio track(s) are: ${audioContext.join(", ")}. Analyze them as the project's soundtrack.`
      : `${ANALYSIS_PROMPT}\n\nNo separate audio track was provided; assess only the video (and any audio embedded in it).`;
    parts.push({ text: promptText });

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
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
    let report: Record<string, unknown> = {};
    try { report = JSON.parse(text); } catch {
      report = {
        verdict: "caution",
        video: { verdict: "caution", reason: "Could not parse the analysis result.", signals: "none" },
        audio: { verdict: "approved", reason: hasAudio ? "Not analyzed." : "No music or voiceover was provided.", signals: "none" },
        overallReason: text.slice(0, 600) || "The analysis could not be completed reliably. Please review manually.",
        recommendations: "Review the video and audio manually before publishing.",
      };
    }

    return new Response(JSON.stringify({ report, hasAudio }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("copyright-check unhandled", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
