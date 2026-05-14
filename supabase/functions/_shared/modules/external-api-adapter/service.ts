// External API Adapter — service implementation.
// Provider/model resolution + cost estimation + real provider calls.
// Wan provider uses Alibaba DashScope (Singapore) image-to-video API.
import type { SupabaseClient } from "../../core/supabase.ts";
import type {
  AiGateway,
  GenerationPollResult,
  GenerationStartInput,
  GenerationStartResult,
  ProviderKey,
  ResolvedRoute,
} from "./contract.ts";
import { getEnv } from "../../core/env.ts";
import { logError } from "../../core/observability.ts";

interface ModelCostConfig {
  // Cost per 1k prompt characters (proxy unit for preview-stage estimation).
  costPer1kChars: number;
}

const COST_MAP: Record<string, ModelCostConfig> = {
  "flow-video-1": { costPer1kChars: 0.04 },
  "veo-3.0-fast-generate-001": { costPer1kChars: 0.04 },
  "veo-3.0-generate-001": { costPer1kChars: 0.08 },
  "veo-3.1-generate-preview": { costPer1kChars: 0.08 },
  "wan-video-1": { costPer1kChars: 0.03 },
  "wan2.7-i2v-2026-04-25": { costPer1kChars: 0.05 },
  "wan2.7-t2v-2026-04-25": { costPer1kChars: 0.05 },
};

function resolveVeoModel(model: string): string {
  // Veo 3.1 supports first+last frame interpolation. Older 3.0 models do not,
  // so we route the generic "flow-video-1" alias to 3.1.
  if (model === "flow-video-1") return "veo-3.1-generate-preview";
  if (model === "veo-3.0-fast-generate-001") return "veo-3.1-generate-preview";
  return model;
}

/** Returns true when the resolved Wan model is text-to-video (no frames). */
function isWanTextToVideoModel(model: string): boolean {
  return /-t2v(-|$)/i.test(model);
}

const MOCK_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
const MOCK_THUMB = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg";

const DASHSCOPE_BASE_URL = "https://dashscope-intl.aliyuncs.com";
const DASHSCOPE_CREATE_PATH = "/api/v1/services/aigc/video-generation/video-synthesis";
const DASHSCOPE_TASK_PATH = "/api/v1/tasks";

function sanitizePrompt(p: string): string {
  return p.replace(/\s+/g, " ").trim();
}

function getProviderApiKey(providerKey: ProviderKey): string | null {
  if (providerKey === "flow") {
    return Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("FLOW_API_KEY") ?? null;
  }
  if (providerKey === "wan") return Deno.env.get("WAN_API_KEY") ?? null;
  return null;
}

function allowMockGeneration(): boolean {
  return getEnv("ALLOW_MOCK_GENERATION", false).toLowerCase() === "true";
}

async function resolveRoute(
  svc: SupabaseClient,
  providerKey: ProviderKey,
  requestedModel: string | undefined,
  prompt: string,
): Promise<ResolvedRoute> {
  const { data, error } = await svc
    .from("core_ai_provider_registry")
    .select("provider_key, default_model, enabled")
    .eq("provider_key", providerKey)
    .maybeSingle();

  if (error) throw new Error(`provider lookup failed: ${error.message}`);
  if (!data) throw new Error(`unknown provider: ${providerKey}`);
  if (!data.enabled) throw new Error(`provider disabled: ${providerKey}`);

  const resolvedModel = (requestedModel?.trim() || data.default_model);
  const cost = COST_MAP[resolvedModel];
  const promptLen = prompt.length;
  const estimatedCost = cost ? +(promptLen / 1000 * cost.costPer1kChars).toFixed(6) : 0;

  return { providerKey, resolvedModel, estimatedCost };
}

// ----- Wan / DashScope ------------------------------------------------------

interface DashScopeCreateResponse {
  output?: { task_id?: string; task_status?: string };
  request_id?: string;
  code?: string;
  message?: string;
}

interface DashScopeTaskResponse {
  output?: {
    task_id?: string;
    task_status?: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | "CANCELED";
    video_url?: string;
    submit_time?: string;
    scheduled_time?: string;
    end_time?: string;
    code?: string;
    message?: string;
    /** Some providers return progress like "50%" or a numeric value. */
    progress?: number | string;
  };
  usage?: { duration?: number; SR?: number; output_video_duration?: number; video_count?: number };
  request_id?: string;
  code?: string;
  message?: string;
}

// Expected total render time for 5s 720P i2v on Wan, used purely to estimate
// progress when DashScope does not return a real percentage. Conservative so
// progress doesn't sit at 95% for too short a time.
const WAN_EXPECTED_RENDER_MS = 150_000; // ~2.5 minutes

function parseProviderProgress(raw: number | string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.min(100, Math.round(raw <= 1 ? raw * 100 : raw)));
  }
  if (typeof raw === "string") {
    const m = raw.match(/(\d+(?:\.\d+)?)/);
    if (m) return Math.max(0, Math.min(100, Math.round(parseFloat(m[1]))));
  }
  return null;
}

function estimateWanProgress(
  status: string,
  submitTime: string | undefined,
  providerProgress: number | null,
): number {
  if (providerProgress !== null) return providerProgress;
  if (status === "SUCCEEDED") return 100;
  if (status === "FAILED" || status === "CANCELED") return 0;
  if (status === "PENDING") return 8;
  // RUNNING / UNKNOWN: time-based.
  const startedAt = submitTime ? Date.parse(submitTime.replace(" ", "T") + "Z") : NaN;
  if (Number.isFinite(startedAt)) {
    const elapsed = Date.now() - startedAt;
    const ratio = elapsed / WAN_EXPECTED_RENDER_MS;
    // Map to 18..95 range so it always feels like progress.
    return Math.max(18, Math.min(95, Math.round(18 + ratio * 77)));
  }
  return 25;
}

async function startWanI2V(
  resolvedModel: string,
  input: GenerationStartInput,
  apiKey: string,
): Promise<GenerationStartResult> {
  if (!input.firstFrameUrl && !input.lastFrameUrl) {
    throw new Error("Wan i2v requires at least firstFrameUrl or lastFrameUrl");
  }

  // Per Wan image-to-video general API reference, the new media[] protocol
  // accepts first_frame and/or last_frame entries. When only one frame is
  // provided, the model treats it as the anchor and generates the rest of
  // the clip from the prompt.
  const media: Array<{ type: "first_frame" | "last_frame"; url: string }> = [];
  if (input.firstFrameUrl) media.push({ type: "first_frame", url: input.firstFrameUrl });
  if (input.lastFrameUrl) media.push({ type: "last_frame", url: input.lastFrameUrl });

  const body = {
    model: resolvedModel,
    input: {
      prompt: input.prompt,
      media,
    },
    parameters: {
      resolution: "720P",
      ratio: input.aspectRatio ?? "16:9",
      duration: input.durationSeconds ?? 5,
      prompt_extend: true,
      watermark: false,
    },
  };

  const res = await fetch(`${DASHSCOPE_BASE_URL}${DASHSCOPE_CREATE_PATH}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as DashScopeCreateResponse;
  if (!res.ok) {
    logError("dashscope create failed", {
      status: res.status,
      code: json.code,
      message: json.message,
      requestId: json.request_id,
      model: resolvedModel,
    });
    throw new Error(
      `DashScope ${res.status} ${json.code ?? ""} ${json.message ?? "unknown error"} (request_id=${json.request_id ?? "?"})`.trim(),
    );
  }
  const taskId = json.output?.task_id;
  if (!taskId) {
    throw new Error(`DashScope returned no task_id (request_id=${json.request_id ?? "?"})`);
  }

  return {
    providerJobId: taskId,
    videoUrl: null,
    thumbnailUrl: null,
    aspectRatio: null,
    duration: null,
    isComplete: false,
  };
}

async function startWanT2V(
  resolvedModel: string,
  input: GenerationStartInput,
  apiKey: string,
): Promise<GenerationStartResult> {
  // Wan 2.7 text-to-video: prompt only, no media. Same async create endpoint.
  const body = {
    model: resolvedModel,
    input: { prompt: input.prompt },
    parameters: {
      resolution: "720P",
      ratio: input.aspectRatio ?? "16:9",
      duration: input.durationSeconds ?? 5,
      prompt_extend: true,
      watermark: false,
    },
  };

  const res = await fetch(`${DASHSCOPE_BASE_URL}${DASHSCOPE_CREATE_PATH}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as DashScopeCreateResponse;
  if (!res.ok) {
    logError("dashscope t2v create failed", {
      status: res.status,
      code: json.code,
      message: json.message,
      requestId: json.request_id,
      model: resolvedModel,
    });
    throw new Error(
      `DashScope ${res.status} ${json.code ?? ""} ${json.message ?? "unknown error"} (request_id=${json.request_id ?? "?"})`.trim(),
    );
  }
  const taskId = json.output?.task_id;
  if (!taskId) {
    throw new Error(`DashScope returned no task_id (request_id=${json.request_id ?? "?"})`);
  }

  return {
    providerJobId: taskId,
    videoUrl: null,
    thumbnailUrl: null,
    aspectRatio: null,
    duration: null,
    isComplete: false,
  };
}

async function pollWanI2V(taskId: string, apiKey: string): Promise<GenerationPollResult> {
  const res = await fetch(`${DASHSCOPE_BASE_URL}${DASHSCOPE_TASK_PATH}/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  const json = (await res.json().catch(() => ({}))) as DashScopeTaskResponse;
  if (!res.ok) {
    logError("dashscope poll failed", {
      status: res.status, code: json.code, message: json.message, requestId: json.request_id,
    });
    throw new Error(
      `DashScope ${res.status} ${json.code ?? ""} ${json.message ?? "unknown error"} (request_id=${json.request_id ?? "?"})`.trim(),
    );
  }
  const status = json.output?.task_status ?? "UNKNOWN";
  const providerProgress = parseProviderProgress(json.output?.progress);
  const progressPercent = estimateWanProgress(status, json.output?.submit_time, providerProgress);

  if (status === "SUCCEEDED") {
    const sr = json.usage?.SR;
    return {
      status: "completed",
      videoUrl: json.output?.video_url ?? null,
      thumbnailUrl: null,
      aspectRatio: typeof sr === "number" ? `${sr}P` : null,
      duration: json.usage?.output_video_duration ?? json.usage?.duration ?? null,
      progressPercent: 100,
    };
  }
  if (status === "FAILED" || status === "CANCELED") {
    return {
      status: "failed",
      videoUrl: null,
      thumbnailUrl: null,
      aspectRatio: null,
      duration: null,
      reason: json.output?.message ?? json.message ?? `task ${status.toLowerCase()}`,
      progressPercent: null,
    };
  }
  if (status === "RUNNING") {
    return { status: "processing", videoUrl: null, thumbnailUrl: null, aspectRatio: null, duration: null, progressPercent };
  }
  return { status: "pending", videoUrl: null, thumbnailUrl: null, aspectRatio: null, duration: null, progressPercent };
}

// ----- Google Veo (Gemini API) ---------------------------------------------

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Veo 3 currently only supports 8-second clips.
const VEO_DURATION_SECONDS = 8;
// Veo 3 supports 16:9 and 9:16 only.
function mapVeoAspect(ar: string | null | undefined): "16:9" | "9:16" {
  if (ar === "9:16") return "9:16";
  if (ar && ar !== "16:9") {
    logError("veo aspect downgrade", { requested: ar, used: "16:9" });
  }
  return "16:9";
}

// Track per-operation start time so the poller can estimate progress for Veo
// (the LRO does not expose a percentage). In-memory only; restarting the edge
// function loses these and we fall back to a default mid-progress.
const veoStartedAt = new Map<string, number>();

async function fetchAsInlineData(url: string): Promise<{ mimeType: string; data: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`failed to fetch frame ${url}: ${r.status}`);
  const mimeType = r.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const buf = new Uint8Array(await r.arrayBuffer());
  // Base64 in chunks to avoid call-stack overflow on large frames.
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)));
  }
  return { mimeType, data: btoa(bin) };
}

async function startVeo(
  resolvedModel: string,
  input: GenerationStartInput,
  apiKey: string,
): Promise<GenerationStartResult> {
  const veoModel = resolveVeoModel(resolvedModel);
  const aspectRatio = mapVeoAspect(input.aspectRatio);

  const instance: Record<string, unknown> = { prompt: input.prompt };
  if (input.firstFrameUrl) {
    instance.image = { inlineData: await fetchAsInlineData(input.firstFrameUrl) };
  }
  if (input.lastFrameUrl) {
    // Veo 3.1 supports first+last frame interpolation via the `lastFrame` field.
    instance.lastFrame = { inlineData: await fetchAsInlineData(input.lastFrameUrl) };
  }

  const body = {
    instances: [instance],
    parameters: {
      aspectRatio,
      durationSeconds: VEO_DURATION_SECONDS,
      // `personGeneration: "allow_all"` was deprecated by Google and now
      // returns 400 INVALID_ARGUMENT. Omit the field to use the default
      // policy ("allow_adult" for supported regions).
      sampleCount: 1,
    },
  };

  const res = await fetch(
    `${GEMINI_BASE}/models/${encodeURIComponent(veoModel)}:predictLongRunning?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    logError("veo create failed", { status: res.status, body: json, model: veoModel });
    const err = (json as { error?: { message?: string } }).error;
    throw new Error(`Veo ${res.status} ${err?.message ?? "unknown error"}`);
  }
  const opName = (json as { name?: string }).name;
  if (!opName) throw new Error("Veo returned no operation name");

  veoStartedAt.set(opName, Date.now());

  return {
    providerJobId: opName,
    videoUrl: null,
    thumbnailUrl: null,
    aspectRatio,
    duration: VEO_DURATION_SECONDS,
    isComplete: false,
  };
}

// Veo clips of 8s typically render in ~60–120s. Bound progress 18..95.
const VEO_EXPECTED_RENDER_MS = 90_000;
function estimateVeoProgress(opName: string): number {
  const startedAt = veoStartedAt.get(opName);
  if (!startedAt) return 35;
  const elapsed = Date.now() - startedAt;
  const ratio = elapsed / VEO_EXPECTED_RENDER_MS;
  return Math.max(18, Math.min(95, Math.round(18 + ratio * 77)));
}

async function pollVeo(
  opName: string,
  apiKey: string,
  ctx?: { client: SupabaseClient; userId: string },
): Promise<GenerationPollResult> {
  const res = await fetch(
    `${GEMINI_BASE}/${opName}?key=${encodeURIComponent(apiKey)}`,
    { method: "GET" },
  );
  const json = (await res.json().catch(() => ({}))) as {
    done?: boolean;
    error?: { message?: string };
    response?: {
      generateVideoResponse?: {
        generatedSamples?: Array<{ video?: { uri?: string } }>;
      };
    };
  };
  if (!res.ok) {
    logError("veo poll failed", { status: res.status, body: json });
    throw new Error(`Veo poll ${res.status} ${json.error?.message ?? "unknown error"}`);
  }
  if (!json.done) {
    return {
      status: "processing",
      videoUrl: null,
      thumbnailUrl: null,
      aspectRatio: null,
      duration: null,
      progressPercent: estimateVeoProgress(opName),
    };
  }
  if (json.error) {
    veoStartedAt.delete(opName);
    return {
      status: "failed",
      videoUrl: null,
      thumbnailUrl: null,
      aspectRatio: null,
      duration: null,
      reason: json.error.message ?? "Veo generation failed",
      progressPercent: null,
    };
  }
  const uri = json.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    veoStartedAt.delete(opName);
    return {
      status: "failed",
      videoUrl: null,
      thumbnailUrl: null,
      aspectRatio: null,
      duration: null,
      reason: "Veo returned no video URI",
      progressPercent: null,
    };
  }

  // Download the generated mp4 (URL requires API key) and re-upload to our
  // public bucket so the frontend can play it without exposing the key.
  if (!ctx) {
    logError("veo poll missing ctx for upload", { opName });
    return {
      status: "processing",
      videoUrl: null,
      thumbnailUrl: null,
      aspectRatio: null,
      duration: null,
      progressPercent: estimateVeoProgress(opName),
    };
  }

  const downloadUrl = uri.includes("?")
    ? `${uri}&key=${encodeURIComponent(apiKey)}`
    : `${uri}?key=${encodeURIComponent(apiKey)}`;
  const dl = await fetch(downloadUrl);
  if (!dl.ok) {
    logError("veo download failed", { status: dl.status, uri });
    throw new Error(`Veo download ${dl.status}`);
  }
  const bytes = new Uint8Array(await dl.arrayBuffer());

  const path = `${ctx.userId}/veo-${crypto.randomUUID()}.mp4`;
  const { error: upErr } = await ctx.client.storage
    .from("merged-videos")
    .upload(path, bytes, { contentType: "video/mp4", upsert: false });
  if (upErr) {
    logError("veo upload failed", { error: upErr.message, path });
    throw new Error(`Veo upload failed: ${upErr.message}`);
  }
  const { data: pub } = ctx.client.storage.from("merged-videos").getPublicUrl(path);
  veoStartedAt.delete(opName);

  return {
    status: "completed",
    videoUrl: pub.publicUrl,
    thumbnailUrl: null,
    aspectRatio: null,
    duration: VEO_DURATION_SECONDS,
    progressPercent: 100,
  };
}

async function startGeneration(
  providerKey: ProviderKey,
  resolvedModel: string,
  input: GenerationStartInput,
): Promise<GenerationStartResult> {
  const apiKey = getProviderApiKey(providerKey);

  if (providerKey === "wan" && apiKey) {
    if (isWanTextToVideoModel(resolvedModel)) {
      return await startWanT2V(resolvedModel, input, apiKey);
    }
    return await startWanI2V(resolvedModel, input, apiKey);
  }

  if (providerKey === "flow" && apiKey) {
    return await startVeo(resolvedModel, input, apiKey);
  }

  if (!apiKey && allowMockGeneration()) {
    return {
      providerJobId: `mock_${crypto.randomUUID()}`,
      videoUrl: MOCK_VIDEO_URL,
      thumbnailUrl: MOCK_THUMB,
      aspectRatio: "16:9",
      duration: 5,
      isComplete: true,
    };
  }

  if (!apiKey) {
    throw new Error(`provider API key missing for ${providerKey}`);
  }

  // Fallback for other real providers without specific implementation: queued.
  return {
    providerJobId: `${providerKey}_${crypto.randomUUID()}`,
    videoUrl: null,
    thumbnailUrl: null,
    aspectRatio: "16:9",
    duration: 5,
    isComplete: false,
  };
}

async function pollGeneration(
  providerKey: ProviderKey,
  providerJobId: string,
  ctx?: { client: SupabaseClient; userId: string },
): Promise<GenerationPollResult> {
  const apiKey = getProviderApiKey(providerKey);

  // Mock providerJobIds always come back complete (mock generations are sync).
  if (providerJobId.startsWith("mock_")) {
    return {
      status: "completed",
      videoUrl: MOCK_VIDEO_URL,
      thumbnailUrl: MOCK_THUMB,
      aspectRatio: "16:9",
      duration: 5,
      progressPercent: 100,
    };
  }

  if (providerKey === "wan" && apiKey) {
    return await pollWanI2V(providerJobId, apiKey);
  }

  if (providerKey === "flow" && apiKey) {
    return await pollVeo(providerJobId, apiKey, ctx);
  }

  // Unknown provider / no key — treat as still processing rather than failing.
  return { status: "processing", videoUrl: null, thumbnailUrl: null, aspectRatio: null, duration: null, progressPercent: 25 };
}

export const aiGateway: AiGateway = {
  resolveRoute,
  sanitizePrompt,
  getProviderApiKey,
  startGeneration,
  pollGeneration,
};
