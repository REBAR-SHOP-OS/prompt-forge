import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { readJsonLoose } from "../_shared/core/safe-json.ts";
import {
  buildShotActionQualityPrompt,
  parseShotActionQualityResponse,
} from "../_shared/shot-action-quality.ts";

const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_CONTEXT_CHARS = 8_000;
const GEMINI_MODEL = "gemini-2.5-flash";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function boundedString(value: unknown, max = MAX_CONTEXT_CHARS): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isAllowedProjectVideoUrl(value: string, projectUrl: string): boolean {
  try {
    const candidate = new URL(value);
    const project = new URL(projectUrl);
    return candidate.protocol === "https:" &&
      candidate.hostname === project.hostname &&
      candidate.pathname.includes("/storage/v1/object/");
  } catch {
    return false;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...Array.from(bytes.subarray(offset, offset + chunkSize)),
    );
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await authenticate(req);
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const videoUrl = boundedString(body?.videoUrl, 4_000);
    const plannedAction = boundedString(body?.plannedAction);
    const previousPlannedAction = boundedString(body?.previousPlannedAction);
    const nextPlannedAction = boundedString(body?.nextPlannedAction);
    const productName = boundedString(body?.productName, 300);
    const shotIndex = Number.isInteger(body?.shotIndex) ? body.shotIndex : -1;
    const totalShots = Number.isInteger(body?.totalShots) ? body.totalShots : 0;
    const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";

    if (!videoUrl || !isAllowedProjectVideoUrl(videoUrl, projectUrl)) {
      return json({ error: "videoUrl must be a signed URL from this project's storage" }, 400);
    }
    if (!plannedAction) return json({ error: "plannedAction is required" }, 400);
    if (shotIndex < 0 || totalShots < 1 || shotIndex >= totalShots) {
      return json({ error: "shotIndex and totalShots are inconsistent" }, 400);
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "Shot quality evaluator is not configured" }, 500);

    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) return json({ error: `Could not fetch shot video (${videoResponse.status})` }, 502);
    const declaredBytes = Number(videoResponse.headers.get("content-length") ?? 0);
    if (declaredBytes > MAX_VIDEO_BYTES) return json({ error: "Shot video is too large to evaluate" }, 413);
    const mimeType = videoResponse.headers.get("content-type")?.split(";")[0]?.trim() || "video/mp4";
    if (!mimeType.startsWith("video/")) return json({ error: "Shot URL did not return a video" }, 415);
    const bytes = new Uint8Array(await videoResponse.arrayBuffer());
    if (bytes.byteLength > MAX_VIDEO_BYTES) return json({ error: "Shot video is too large to evaluate" }, 413);

    const prompt = buildShotActionQualityPrompt({
      shotIndex,
      totalShots,
      plannedAction,
      previousPlannedAction: previousPlannedAction || undefined,
      nextPlannedAction: nextPlannedAction || undefined,
      productName: productName || undefined,
    });
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { inlineData: { mimeType, data: toBase64(bytes) } },
              { text: prompt },
            ],
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!geminiResponse.ok) {
      console.error("film-shot-quality evaluator error", geminiResponse.status);
      return json({ error: `Shot quality evaluator failed (${geminiResponse.status})` }, 502);
    }

    const modelResponse = await readJsonLoose(geminiResponse, "film-shot-quality");
    const raw = modelResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
    const evaluation = typeof raw === "string" ? parseShotActionQualityResponse(raw) : null;
    if (!evaluation) return json({ error: "Shot quality evaluator returned an invalid response" }, 502);

    return json({ evaluation });
  } catch (error) {
    console.error("film-shot-quality unhandled", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Internal error" }, 500);
  }
});
