import { corsHeaders } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { readJsonLoose } from "../_shared/core/safe-json.ts";
import {
  buildPreviewShotQualityPrompt,
  parsePreviewShotQualityResponse,
} from "../_shared/preview-shot-quality.ts";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CONTEXT_CHARS = 8_000;
const FETCH_TIMEOUT_MS = 30_000;
const SHOT_MODES = ["product", "character", "environment", "interaction"] as const;
type ShotMode = typeof SHOT_MODES[number];

function isShotMode(value: string): value is ShotMode {
  return SHOT_MODES.some((mode) => mode === value);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function boundedString(value: unknown, max = MAX_CONTEXT_CHARS): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function isAllowedOwnedPreviewUrl(value: string, projectUrl: string, userId: string): boolean {
  try {
    const candidate = new URL(value);
    const project = new URL(projectUrl);
    const path = decodeURIComponent(candidate.pathname);
    return candidate.protocol === "https:" &&
      candidate.hostname === project.hostname &&
      path.includes("/storage/v1/object/") &&
      path.includes("/wan-frames/") &&
      path.includes(`/${userId}/`);
  } catch {
    return false;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(offset, offset + chunkSize)));
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
    const imageUrl = boundedString(body?.imageUrl, 4_000);
    const plannedAction = boundedString(body?.plannedAction);
    const previousPlannedAction = boundedString(body?.previousPlannedAction);
    const nextPlannedAction = boundedString(body?.nextPlannedAction);
    const productName = boundedString(body?.productName, 300);
    const shotModeRaw = boundedString(body?.shotMode, 30);
    const shotMode: ShotMode = isShotMode(shotModeRaw) ? shotModeRaw : "product";
    const shotIndex = Number.isInteger(body?.shotIndex) ? body.shotIndex : -1;
    const totalShots = Number.isInteger(body?.totalShots) ? body.totalShots : 0;
    const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";

    if (!imageUrl || !isAllowedOwnedPreviewUrl(imageUrl, projectUrl, auth.userId)) {
      return json({ error: "imageUrl must be this user's signed wan-frames preview URL" }, 400);
    }
    if (!plannedAction) return json({ error: "plannedAction is required" }, 400);
    if (shotIndex < 0 || totalShots < 1 || shotIndex >= totalShots) {
      return json({ error: "shotIndex and totalShots are inconsistent" }, 400);
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI gateway not configured" }, 500);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let imageResponse: Response;
    try {
      imageResponse = await fetch(imageUrl, { signal: controller.signal });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "AbortError";
      return json({ error: timedOut ? "Preview image fetch timed out" : "Could not fetch preview image" }, 502);
    } finally {
      clearTimeout(timeout);
    }

    if (!imageResponse.ok) return json({ error: `Could not fetch preview image (${imageResponse.status})` }, 502);
    const declaredBytes = Number(imageResponse.headers.get("content-length") ?? 0);
    if (declaredBytes > MAX_IMAGE_BYTES) return json({ error: "Preview image is too large to evaluate" }, 413);
    const mimeType = imageResponse.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    if (!mimeType.startsWith("image/")) return json({ error: "Preview URL did not return an image" }, 415);
    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) return json({ error: "Preview image is too large to evaluate" }, 413);
    const imageDataUrl = `data:${mimeType};base64,${toBase64(bytes)}`;

    const prompt = buildPreviewShotQualityPrompt({
      shotIndex,
      totalShots,
      shotMode,
      plannedAction,
      previousPlannedAction: previousPlannedAction || undefined,
      nextPlannedAction: nextPlannedAction || undefined,
      productName: productName || undefined,
    });
    const geminiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageDataUrl } },
              { type: "text", text: prompt },
            ],
          }],
        }),
      },
    );

    if (!geminiResponse.ok) {
      console.error("film-preview-quality evaluator error", geminiResponse.status);
      return json({ error: `Preview quality evaluator failed (${geminiResponse.status})` }, 502);
    }

    const modelResponse = await readJsonLoose(geminiResponse, "film-preview-quality");
    const raw = modelResponse?.choices?.[0]?.message?.content;
    const evaluation = typeof raw === "string" ? parsePreviewShotQualityResponse(raw.trim()) : null;
    if (!evaluation) return json({ error: "Preview quality evaluator returned an invalid response" }, 502);

    return json({ evaluation });
  } catch (error) {
    console.error("film-preview-quality unhandled", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Internal error" }, 500);
  }
});
