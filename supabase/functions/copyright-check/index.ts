// copyright-check: download the final video (and optional music/voiceover),
// send them to Gemini multimodal, and return a structured copyright-risk
// assessment with separate verdicts + reasons for the video and the music.
import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { readJsonLoose } from "../_shared/core/safe-json.ts";

const INLINE_VIDEO_BYTES = 18 * 1024 * 1024; // inline only small videos (Gemini ~20MB request cap)
const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // larger videos go through the Files API (up to 2GB supported)
const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15MB cap for audio

const ANALYSIS_PROMPT = `You are an EXTREMELY STRICT, zero-tolerance copyright, trademark, and content-rights
reviewer for short marketing/social videos used in COMMERCIAL contexts.
You receive a VIDEO and, optionally, a MUSIC track and/or a VOICEOVER track.
Inspect EVERY frame and EVERY second of audio meticulously. Err on the side of caution:
when in doubt, escalate the risk level. Commercial use removes most fair-use defenses,
so even small or partial appearances of protected material matter.

For the VIDEO, examine ALL of these dimensions frame by frame:
- Brand logos, trademarks, brand names, slogans, taglines (even partial / blurred / background).
- Copyrighted characters, mascots, cartoon figures, fictional creatures.
- Recognizable clips, scenes, shots, or stills from films, series, TV, games, ads, music videos.
- Celebrity / public-figure likeness, recognizable real people, or convincing look-alikes
  (right-of-publicity risk).
- On-screen text quoting copyrighted lyrics, poems, scripts, books, or headlines.
- Copyrighted artwork, paintings, photographs, posters, album covers, illustrations.
- Watermarks, stock-footage marks, source overlays, or platform UI (TikTok/YouTube/etc.).
- Product designs, packaging, vehicles, buildings, or landmarks with protected/trade-dress identity.
- Fonts or typefaces tied to a specific brand identity.
- Sports team kits, logos, league branding, or jersey names/numbers.
- Any UI/app/website screen capture that exposes a third-party product.

For the MUSIC, judge strictly whether it resembles a known commercial/copyrighted song
or recording in ANY way:
- Melody, hook, chord progression, riff, lyrics, vocal style, or recognizable artist.
- Samples, interpolations, covers, remixes, or "sound-alike" tracks.
- Sound effects or jingles tied to a brand (e.g. recognizable brand sonic logos).
Only treat music as safe when it is clearly generic, royalty-free, or AI-generated with
no resemblance to known works. If only a voiceover is present (speech, no song),
treat it as low risk UNLESS it quotes copyrighted material (lyrics, scripts, books,
trademarked slogans) or impersonates a recognizable real person's voice.

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

Rules (STRICT — assume commercial use, so fair-use rarely applies):
- "approved" = ONLY when you found absolutely no protected material across ANY dimension above.
- "caution" = any possible, partial, uncertain, or hard-to-verify resemblance to protected
  material — this is the DEFAULT whenever you are not fully certain something is safe.
- "rejected" = any clearly identifiable copyrighted, trademarked, or right-of-publicity material,
  even if brief, partial, in the background, or only one instance.
- Never downgrade risk just because the appearance is short, small, blurry, or incidental.
- The top-level "verdict" must be the WORST of the two section statuses
  (rejected > caution > approved; ignore "not_provided").
- Be concrete and specific: in each "reason" name exactly what you saw/heard and where
  (e.g. timestamp, on-screen location). Populate "risks" with every distinct issue found.
- Be honest. If you are unsure, use "caution"; never invent details and never assume safety.
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

// Upload a (potentially large) video to the Gemini Files API and return a
// fileData part once the file becomes ACTIVE. This bypasses the ~20MB inline
// request cap that causes "Video too large to analyze".
async function uploadToGemini(apiKey: string, bytes: Uint8Array, mimeType: string) {
  const startResp = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: "copyright-review-video" } }),
    },
  );
  if (!startResp.ok) throw new Error(`files start ${startResp.status}`);
  const uploadUrl = startResp.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("no upload url");

  const uploadResp = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes,
  });
  if (!uploadResp.ok) throw new Error(`files upload ${uploadResp.status}`);
  const uploaded = await uploadResp.json();
  let file = uploaded?.file;
  if (!file?.uri || !file?.name) throw new Error("upload missing file uri");

  // Poll until the file is ACTIVE (video processing) before referencing it.
  for (let i = 0; i < 30 && file?.state === "PROCESSING"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const statResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${apiKey}`,
    );
    if (!statResp.ok) break;
    file = await statResp.json();
  }
  if (file?.state !== "ACTIVE") throw new Error("file not active");
  return { fileUri: file.uri as string, mimeType: (file.mimeType as string) || mimeType };
}

async function buildVideoPart(apiKey: string, url: string) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${resp.status}`);
  const mimeType = resp.headers.get("content-type") || "video/mp4";
  const buf = new Uint8Array(await resp.arrayBuffer());
  if (buf.byteLength > MAX_VIDEO_BYTES) throw new Error("too_large");
  if (buf.byteLength <= INLINE_VIDEO_BYTES) {
    return { inlineData: { mimeType, data: toBase64(buf) } };
  }
  const up = await uploadToGemini(apiKey, buf, mimeType);
  return { fileData: { mimeType: up.mimeType, fileUri: up.fileUri } };
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
    const jobId: string = typeof body?.jobId === "string" ? body.jobId.trim() : "";

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
      const videoPart = await buildVideoPart(apiKey, videoUrl);
      parts.push(videoPart);
      parts.push({ text: "The above is the VIDEO to review." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = msg === "too_large" ? 413 : 502;
      return new Response(JSON.stringify({ error: msg === "too_large" ? "Video too large to analyze (>500MB)" : "Could not fetch video" }), {
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
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

    const data = await readJsonLoose(geminiResp, "copyright-check");
    if (!data) {
      return new Response(JSON.stringify({ error: "Analysis service returned an invalid response" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
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

    // Persist the verdict so the Library icon can reflect it across reloads.
    if (jobId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        if (supabaseUrl && serviceKey) {
          const verdict = typeof result?.verdict === "string" ? result.verdict : "caution";
          const videoStatus = (result?.video as Record<string, unknown> | undefined)?.status;
          const musicStatus = (result?.music as Record<string, unknown> | undefined)?.status;
          const summary = typeof result?.summary === "string" ? result.summary : null;
          const row = {
            job_id: jobId,
            user_id: auth.userId,
            verdict,
            video_status: typeof videoStatus === "string" ? videoStatus : null,
            music_status: typeof musicStatus === "string" ? musicStatus : null,
            summary,
            result,
            updated_at: new Date().toISOString(),
          };
          const upsertResp = await fetch(
            `${supabaseUrl}/rest/v1/generator_copyright_reviews?on_conflict=job_id`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                Prefer: "resolution=merge-duplicates,return=minimal",
              },
              body: JSON.stringify(row),
            },
          );
          if (!upsertResp.ok) {
            console.warn("copyright-check persist failed", upsertResp.status, await upsertResp.text().catch(() => ""));
          }
        }
      } catch (persistErr) {
        console.warn("copyright-check persist error", persistErr);
      }
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
