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
const PROVIDER_FETCH_TIMEOUT_MS = 30_000;

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

async function providerFetch(url: string, init: RequestInit): Promise<Response> {
  return await fetch(url, {
    ...init,
    headers: {
      "User-Agent": "prompt-forge-edge/1.0",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS),
  });
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
  if (!input.firstFrameUrl || !input.lastFrameUrl) {
    throw new Error("Wan i2v requires both firstFrameUrl and lastFrameUrl");
  }

  // Per Wan image-to-video generation docs, `input` accepts prompt + image URLs.
  // `parameters` carries render settings like resolution/duration.
  const payload = {
    model: resolvedModel,
    input: {
      prompt: sanitizePrompt(input.prompt),
      first_frame_url: input.firstFrameUrl,
      last_frame_url: input.lastFrameUrl,
    },
    parameters: {
      resolution: "720P",
      duration: Math.max(1, Math.min(60, input.durationSeconds ?? 5)),
      prompt_extend: true,
      watermark: false,
    },
  };

  const res = await providerFetch(`${DASHSCOPE_BASE_URL}${DASHSCOPE_CREATE_PATH}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(payload),
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
    isComplete: false,
  };
}

// Optional text-to-video route for future use if provider/model supports it.
async function startWanT2V(
  resolvedModel: string,
  input: GenerationStartInput,
  apiKey: string,
): Promise<GenerationStartResult> {
  const payload = {
    model: resolvedModel,
    input: { prompt: sanitizePrompt(input.prompt) },
    parameters: {
      resolution: "720P",
      duration: Math.max(1, Math.min(60, input.durationSeconds ?? 5)),
      prompt_extend: true,
      watermark: false,
    },
  };

  const res = await providerFetch(`${DASHSCOPE_BASE_URL}${DASHSCOPE_CREATE_PATH}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(payload),
  });

  const json = (await res.json().catch(() => ({}))) as DashScopeCreateResponse;
  if (!res.ok) {
    logError("dashscope create failed", { status: res.status, code: json.code, message: json.message });
    throw new Error(`DashScope ${res.status}: ${json.code ?? ""} ${json.message ?? "unknown error"}`.trim());
  }
  const taskId = json.output?.task_id;
  if (!taskId) {
    throw new Error(`DashScope returned no task_id (request_id=${json.request_id ?? "?"})`);
  }

  return { providerJobId: taskId, isComplete: false };
}

async function pollWanI2V(taskId: string, apiKey: string): Promise<GenerationPollResult> {
  const res = await providerFetch(`${DASHSCOPE_BASE_URL}${DASHSCOPE_TASK_PATH}/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  const json = (await res.json().catch(() => ({}))) as DashScopeTaskResponse;
  if (!res.ok) {
    logError("dashscope poll failed", { status: res.status, code: json.code, message: json.message });
    throw new Error(`DashScope poll ${res.status}: ${json.code ?? ""} ${json.message ?? "unknown error"}`.trim());
  }

  const status = json.output?.task_status ?? "UNKNOWN";
  if (status === "SUCCEEDED") {
    const videoUrl = json.output?.video_url;
    if (!videoUrl) throw new Error("DashScope task succeeded but returned no video_url");
    const duration = json.usage?.duration ?? json.usage?.output_video_duration;
    const sr = json.usage?.SR;
    const aspectRatio = sr ? `${sr}` : undefined;
    return {
      status: "completed",
      videoUrl,
      thumbnailUrl: undefined,
      duration,
      aspectRatio,
      progressPercent: 100,
    };
  }

  if (status === "FAILED" || status === "CANCELED") {
    const msg = json.output?.message || json.message || "provider task failed";
    logError("dashscope task failed", { taskId, msg, code: json.output?.code ?? json.code });
    return { status: "failed" };
  }

  const providerProgress = parseProviderProgress(json.output?.progress);
  return {
    status: "processing",
    progressPercent: estimateWanProgress(status, json.output?.submit_time, providerProgress),
  };
}

// ----- Public facade --------------------------------------------------------

export const aiGateway: AiGateway = {
  sanitizePrompt,
  resolveRoute,

  async startGeneration(
    providerKey,
    resolvedModel,
    input,
  ): Promise<GenerationStartResult> {
    const apiKey = getProviderApiKey(providerKey);

    // Mock mode useful for early phases / local demo without provider billing.
    if (allowMockGeneration()) {
      const isT2V = !input.firstFrameUrl && !input.lastFrameUrl;
      return {
        providerJobId: `mock_${crypto.randomUUID()}`,
        isComplete: true,
        videoUrl: MOCK_VIDEO_URL,
        thumbnailUrl: MOCK_THUMB,
        duration: input.durationSeconds ?? 5,
        aspectRatio: isT2V ? "16:9" : "16:9",
      };
    }

    if (!apiKey) {
      throw new Error(`Missing API key for provider: ${providerKey}`);
    }

    // Wan supports both i2v and t2v; choose by resolved model and presence of frames.
    if (providerKey === "wan") {
      const wantsT2V = isWanTextToVideoModel(resolvedModel) || (!input.firstFrameUrl && !input.lastFrameUrl);
      if (wantsT2V) {
        return await startWanT2V(resolvedModel, input, apiKey);
      }
      return await startWanI2V(resolvedModel, input, apiKey);
    }

    // Flow provider not yet wired with a real backend in this phase.
    throw new Error(`Unsupported provider: ${providerKey}`);
  },

  async pollGeneration(providerKey, providerJobId): Promise<GenerationPollResult> {
    const apiKey = getProviderApiKey(providerKey);
    if (allowMockGeneration()) {
      return {
        status: "completed",
        videoUrl: MOCK_VIDEO_URL,
        thumbnailUrl: MOCK_THUMB,
        duration: 5,
        aspectRatio: "16:9",
        progressPercent: 100,
      };
    }
    if (!apiKey) throw new Error(`Missing API key for provider: ${providerKey}`);
    if (providerKey === "wan") {
      return await pollWanI2V(providerJobId, apiKey);
    }
    throw new Error(`Unsupported provider: ${providerKey}`);
  },
};
