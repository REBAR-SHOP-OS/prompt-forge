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
  "wan-video-1": { costPer1kChars: 0.03 },
  "wan2.7-i2v-2026-04-25": { costPer1kChars: 0.05 },
  "wan2.7-t2v-2026-04-25": { costPer1kChars: 0.05 },
};

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
  if (providerKey === "flow") return Deno.env.get("FLOW_API_KEY") ?? null;
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

// ----- Public adapter -------------------------------------------------------

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
