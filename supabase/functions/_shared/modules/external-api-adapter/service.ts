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
  ResolveRouteOptions,
} from "./contract.ts";
import { getEnv } from "../../core/env.ts";
import { logError, logInfo } from "../../core/observability.ts";

// ---- Cost model -------------------------------------------------------------
// Costs are real provider USD rates so audit logs reflect true spend.
// Veo is per-second; Wan is flat per clip. The gateway converts USD to credits
// by ×100 (1 credit = $0.01) before charging.
interface ModelCost {
  perSecondUsd?: number;
  flatUsd?: number;
}

const COST_MAP_USD: Record<string, ModelCost> = {
  // Google Veo — pricing per second of generated video
  "veo-3.0-fast-generate-001": { perSecondUsd: 0.10 },
  "veo-3.0-generate-001":      { perSecondUsd: 0.40 },
  "veo-3.1-generate-preview":  { perSecondUsd: 0.40 },
  // Alibaba Wan — flat per clip (5–10s)
  "wan-video-1":              { flatUsd: 0.15 },
  "wan2.7-i2v-2026-04-25":    { flatUsd: 0.15 },
  "wan2.7-t2v-2026-04-25":    { flatUsd: 0.15 },
};

/** Compute USD cost for one generation, including Veo extension chain. */
function computeUsd(resolvedModel: string, durationSeconds: number): number {
  const cfg = COST_MAP_USD[resolvedModel];
  if (!cfg) return 0;
  if (cfg.flatUsd !== undefined) return cfg.flatUsd;
  if (cfg.perSecondUsd !== undefined) {
    // Veo single call is 8s; longer requests chain a 2nd call → bill both.
    const calls = durationSeconds > 8 ? 2 : 1;
    const billed = calls === 2 ? 16 : Math.min(8, durationSeconds);
    return +(cfg.perSecondUsd * billed).toFixed(4);
  }
  return 0;
}

/** Map the public model alias to a concrete provider model. The cheaper
 *  Veo 3 Fast tier is preferred by default; we fall back to Veo 3.1
 *  Standard when the request *requires* a capability Fast does not support:
 *   - first+last frame interpolation (lastFrame), or
 *   - durations > 8s, which are delivered via the Veo extension chain and
 *     are NOT allowed on veo-3.0-fast (Google returns 400 "Video extension
 *     is not allowed for this model"). */
function resolveVeoModel(model: string, opts: ResolveRouteOptions = {}): string {
  const needs31 = Boolean(opts.hasLastFrame) || (opts.durationSeconds ?? 0) > 8;
  if (model === "flow-video-1") {
    return needs31 ? "veo-3.1-generate-preview" : "veo-3.0-fast-generate-001";
  }
  if (model === "flow-video-1-pro") return "veo-3.1-generate-preview";
  return model;
}

/** Veo Fast cannot be extended. When a job needs more than a single 8s base
 *  clip (i.e. an extension chain), force the model up to Veo 3.1 even if an
 *  alias/legacy route resolved to Fast. Keeps the fix independent of the
 *  route-preview path. */
function ensureVeoExtensionCapable(model: string, willExtend: boolean): string {
  if (willExtend && model === "veo-3.0-fast-generate-001") {
    return "veo-3.1-generate-preview";
  }
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
  opts: ResolveRouteOptions = {},
): Promise<ResolvedRoute> {
  const { data, error } = await svc
    .from("core_ai_provider_registry")
    .select("provider_key, default_model, enabled")
    .eq("provider_key", providerKey)
    .maybeSingle();

  if (error) throw new Error(`provider lookup failed: ${error.message}`);
  if (!data) throw new Error(`unknown provider: ${providerKey}`);
  if (!data.enabled) throw new Error(`provider disabled: ${providerKey}`);

  const aliasOrModel = (requestedModel?.trim() || data.default_model);
  // For Veo (flow) provider we expand the alias to a concrete model so cost
  // is computed against the actual tier we'll bill against.
  const resolvedModel = providerKey === "flow"
    ? resolveVeoModel(aliasOrModel, opts)
    : aliasOrModel;

  const duration = opts.durationSeconds && opts.durationSeconds > 0
    ? opts.durationSeconds
    : 5;
  const estimatedCost = computeUsd(resolvedModel, duration);

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

// Time-based progress that ramps 15 -> 60 over `expectedMs`, then slowly creeps
// 60 -> ~95 on an asymptotic tail so a long-running provider job never looks
// frozen. Never returns 100 (reserved for real completion).
export function creepingProgress(elapsedMs: number, expectedMs: number): number {
  const ratio = expectedMs > 0 ? Math.max(0, elapsedMs) / expectedMs : 0;
  if (ratio <= 1) return Math.max(15, Math.round(15 + ratio * 45));
  const tail = ratio - 1;
  return Math.min(95, Math.round(60 + (tail / (tail + 3)) * 35));
}

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
  // Honor the provider's real progress as-is (it's the truth).
  if (providerProgress !== null) return Math.max(0, Math.min(99, providerProgress));
  if (status === "SUCCEEDED") return 100;
  if (status === "FAILED" || status === "CANCELED") return 0;
  if (status === "PENDING") return 8;
  // RUNNING / UNKNOWN with no real provider progress: time-based ramp to 60
  // over the expected window, then a slow asymptotic creep toward ~95 so the
  // bar keeps visibly moving when the provider takes longer than usual instead
  // of freezing at 60. It never reaches 100 — only real completion does.
  const startedAt = submitTime ? Date.parse(submitTime.replace(" ", "T") + "Z") : NaN;
  if (Number.isFinite(startedAt)) {
    return creepingProgress(Date.now() - startedAt, WAN_EXPECTED_RENDER_MS);
  }
  return 20;
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
  if (status === "UNKNOWN") {
    // DashScope returns UNKNOWN when the task_id is expired (>24h) or invalid.
    // Treat as terminal failure so the job doesn't hang forever.
    return {
      status: "failed",
      videoUrl: null,
      thumbnailUrl: null,
      aspectRatio: null,
      duration: null,
      reason: "Video provider lost track of this task (expired or unknown). Please try again.",
      progressPercent: null,
    };
  }
  return { status: "pending", videoUrl: null, thumbnailUrl: null, aspectRatio: null, duration: null, progressPercent };
}

// ----- Google Veo (Gemini API) ---------------------------------------------

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Single-call Veo clip length. 10s/15s are delivered by chaining one
// 8s base render + one +7s extension call (see veoTargetDuration below).
const VEO_BASE_DURATION_SECONDS = 8;
const VEO_EXTENDED_DURATION_SECONDS = 16; // 8 base + 8 extension

// Veo 3 supports 16:9 and 9:16 only.
function mapVeoAspect(ar: string | null | undefined): "16:9" | "9:16" {
  if (ar === "9:16") return "9:16";
  if (ar && ar !== "16:9") {
    logError("veo aspect downgrade", { requested: ar, used: "16:9" });
  }
  return "16:9";
}

// Per-operation start time for time-based progress estimation only. In-memory
// only; safe to lose across restarts because durable state lives in the
// encoded provider_job_id (see VeoState below).
const veoStartedAt = new Map<string, number>();

// ----- Durable Veo state -----------------------------------------------------
// We encode everything we need to resume a Veo job (including the optional
// extension chain for 10s/15s outputs) inside the provider_job_id stored on
// the job row. That way an edge-function restart between polls cannot lose
// the extension state and silently truncate a 15s clip down to 8s.
//
// Wire format: "veo:v1:<base64url-json>"
interface VeoState {
  // The original predictLongRunning operation name (phase 1).
  initialOp: string;
  // The currently-active operation we should poll (phase 1 op, or phase 2 op
  // once the extension call has been kicked off).
  currentOp: string;
  // 8 for single-call clips, 15 when extension chaining is required.
  targetDuration: number;
  // Veo model name used for the create call (also used for the extension).
  model: string;
  // 16:9 / 9:16 — required to re-issue the extension call.
  aspectRatio: "16:9" | "9:16";
  // Original prompt — required to re-issue the extension call.
  prompt: string;
  // Whether phase 2 (extension) has already been dispatched.
  extensionStarted: boolean;
  // ms since epoch when the *current* phase started; used for progress.
  phaseStartedAt: number;
  // Phase-1 video URI we still need to extend (set when extend was attempted
  // but Veo wasn't ready yet — retried on subsequent polls).
  pendingExtensionUri?: string;
  // How many times we've tried to start the extension. Capped to avoid loops.
  extensionAttempts?: number;
  // ms since epoch — the earliest time we're allowed to retry the extension
  // call. Google needs a real ingest window after phase-1 finishes; retrying
  // every poll (~2-4s) burns the attempt budget before the file is ready.
  nextExtensionAttemptAt?: number;
}

const MAX_EXTENSION_ATTEMPTS = 20;
// Backoff between extension retries when Google says the phase-1 clip isn't
// processed yet. Linear: 15s, 30s, 45s, ... capped at 90s.
const EXTENSION_RETRY_BASE_MS = 15_000;
const EXTENSION_RETRY_CAP_MS = 90_000;

const VEO_STATE_PREFIX = "veo:v1:";

function encodeVeoState(state: VeoState): string {
  // Use UTF-8 safe base64url so non-Latin1 prompts (e.g. Persian) don't blow
  // up btoa() with "Cannot encode string: string contains characters outside
  // of the Latin1 range".
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  const b64 = bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${VEO_STATE_PREFIX}${b64}`;
}

function decodeVeoState(providerJobId: string): VeoState | null {
  if (!providerJobId.startsWith(VEO_STATE_PREFIX)) return null;
  const b64url = providerJobId.slice(VEO_STATE_PREFIX.length);
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (b64url.length % 4)) % 4);
  try {
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as VeoState;
    if (typeof parsed.currentOp !== "string" || typeof parsed.initialOp !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Veo errors that should NOT permanently fail the job — the next poll will
 * retry the same operation. Covers Google's transient capacity / availability
 * messages and standard 5xx-style transient codes.
 */
function isTransientVeoError(message: string | undefined | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("high demand") ||
    m.includes("try again later") ||
    m.includes("temporarily unavailable") ||
    m.includes("temporary") ||
    m.includes("overloaded") ||
    m.includes("unavailable") ||
    m.includes("deadline exceeded") ||
    m.includes("rate limit") ||
    m.includes("quota") ||
    isVeoNotProcessedYet(message)
  );
}

/**
 * Veo's extend endpoint briefly rejects a just-finished phase-1 clip with
 * "Input video must be a video that was generated by VEO that has been
 * processed." while Google's side finishes ingesting the file. Retry, don't
 * fail.
 */
function isVeoNotProcessedYet(message: string | undefined | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("has been processed") ||
    m.includes("not been processed") ||
    m.includes("still processing") ||
    m.includes("is being processed") ||
    m.includes("not yet processed")
  );
}

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

function bytesToBase64(buf: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

async function startVeo(
  resolvedModel: string,
  input: GenerationStartInput,
  apiKey: string,
): Promise<GenerationStartResult> {
  const requested = input.durationSeconds ?? VEO_BASE_DURATION_SECONDS;
  // Veo's single call is capped at 8s; longer requests are served by extension.
  const willExtend = requested > VEO_BASE_DURATION_SECONDS;

  // Expand any alias (no-op when already concrete) and then guarantee the
  // model can actually be extended. Veo Fast does not support the extension
  // chain, so a 10s/15s request must run on Veo 3.1 even if a legacy/route
  // path handed us veo-3.0-fast.
  const veoModel = ensureVeoExtensionCapable(
    resolveVeoModel(resolvedModel, {
      durationSeconds: requested,
      hasLastFrame: Boolean(input.lastFrameUrl),
    }),
    willExtend,
  );
  const aspectRatio = mapVeoAspect(input.aspectRatio);

  const instance: Record<string, unknown> = { prompt: input.prompt };
  if (input.firstFrameUrl) {
    const frame = await fetchAsInlineData(input.firstFrameUrl);
    instance.image = { bytesBase64Encoded: frame.data, mimeType: frame.mimeType };
  }
  if (input.lastFrameUrl) {
    // Veo 3.1 supports first+last frame interpolation via the `lastFrame` field.
    const frame = await fetchAsInlineData(input.lastFrameUrl);
    instance.lastFrame = { bytesBase64Encoded: frame.data, mimeType: frame.mimeType };
  }


  const body = {
    instances: [instance],
    parameters: {
      aspectRatio,
      durationSeconds: VEO_BASE_DURATION_SECONDS,
      // `personGeneration: "allow_all"` was deprecated by Google for image-to-
      // video / interpolation flows. Omit so the default ("allow_adult") applies.
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

  const targetDuration = willExtend ? VEO_EXTENDED_DURATION_SECONDS : VEO_BASE_DURATION_SECONDS;
  const state: VeoState = {
    initialOp: opName,
    currentOp: opName,
    targetDuration,
    model: veoModel,
    aspectRatio,
    prompt: input.prompt,
    extensionStarted: false,
    phaseStartedAt: Date.now(),
  };
  veoStartedAt.set(opName, Date.now());

  return {
    providerJobId: encodeVeoState(state),
    videoUrl: null,
    thumbnailUrl: null,
    aspectRatio,
    duration: targetDuration,
    isComplete: false,
  };
}

// Veo clips of 8s typically render in ~60–120s. Bound progress 18..95.
const VEO_EXPECTED_RENDER_MS = 90_000;
function estimateVeoProgressFromState(state: VeoState): number {
  const elapsed = Date.now() - (state.phaseStartedAt || veoStartedAt.get(state.currentOp) || Date.now());
  const ratio = elapsed / VEO_EXPECTED_RENDER_MS;
  const phaseProgress = Math.max(18, Math.min(95, Math.round(18 + ratio * 77)));
  const hasExtension = state.targetDuration > VEO_BASE_DURATION_SECONDS;
  if (!hasExtension) return phaseProgress;
  if (!state.extensionStarted) return Math.round(phaseProgress * 0.5);
  return Math.min(95, 50 + Math.round(phaseProgress * 0.45));
}

async function startVeoExtension(
  state: VeoState,
  videoUri: string,
  apiKey: string,
): Promise<string> {
  // Gemini Developer API for Veo 3.1 video extension accepts the previously
  // generated clip *by URI only* (not inline bytes — that returns 400
  // "`inlineData` isn't supported by this model"). The URI is the same
  // generativelanguage Files resource we got back from phase 1.
  const body = {
    instances: [{
      prompt: state.prompt,
      video: { uri: videoUri },
    }],
    parameters: {
      // The raw Gemini predictLongRunning endpoint does not accept the SDK
      // field `numberOfVideos` for Veo extension. Extension supports a very
      // small parameter set; keep this aligned with the Developer API shape.
      resolution: "720p",
      aspectRatio: state.aspectRatio,
      durationSeconds: VEO_BASE_DURATION_SECONDS,
    },
  };

  const res = await fetch(
    `${GEMINI_BASE}/models/${encodeURIComponent(state.model)}:predictLongRunning?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    logError("veo extend failed", { status: res.status, body: json, initialOp: state.initialOp });
    const err = (json as { error?: { message?: string } }).error;
    throw new Error(`Veo extend ${res.status} ${err?.message ?? "unknown error"}`);
  }
  const newOp = (json as { name?: string }).name;
  if (!newOp) throw new Error("Veo extension returned no operation name");
  return newOp;
}

async function pollVeo(
  providerJobId: string,
  apiKey: string,
  ctx?: { client: SupabaseClient; userId: string },
): Promise<GenerationPollResult> {
  // Decode durable state. Fall back to legacy "raw opName" providerJobIds so
  // jobs created before this rollout keep working.
  const state: VeoState = decodeVeoState(providerJobId) ?? {
    initialOp: providerJobId,
    currentOp: providerJobId,
    targetDuration: VEO_BASE_DURATION_SECONDS,
    model: "veo-3.1-generate-preview",
    aspectRatio: "16:9",
    prompt: "",
    extensionStarted: false,
    phaseStartedAt: veoStartedAt.get(providerJobId) ?? Date.now(),
  };

  const res = await fetch(
    `${GEMINI_BASE}/${state.currentOp}?key=${encodeURIComponent(apiKey)}`,
    { method: "GET" },
  );
  const json = (await res.json().catch(() => ({}))) as {
    done?: boolean;
    error?: { message?: string; code?: number };
    response?: {
      generateVideoResponse?: {
        generatedSamples?: Array<{ video?: { uri?: string } }>;
      };
    };
  };

  // Transient HTTP failure on the poll itself (5xx, 429): keep processing,
  // do not throw — the next poll will retry the same operation.
  if (!res.ok) {
    logError("veo poll http failed", { status: res.status, body: json, op: state.currentOp });
    if (res.status >= 500 || res.status === 429 || isTransientVeoError(json.error?.message)) {
      return {
        status: "processing",
        videoUrl: null,
        thumbnailUrl: null,
        aspectRatio: null,
        duration: null,
        progressPercent: estimateVeoProgressFromState(state),
      };
    }
    throw new Error(`Veo poll ${res.status} ${json.error?.message ?? "unknown error"}`);
  }

  if (!json.done) {
    return {
      status: "processing",
      videoUrl: null,
      thumbnailUrl: null,
      aspectRatio: null,
      duration: null,
      progressPercent: estimateVeoProgressFromState(state),
    };
  }

  // The operation finished, possibly with an error.
  if (json.error) {
    // Treat capacity / availability errors as retryable: the next poll will
    // see the same `done:true + error`, so we re-issue the create call to
    // retry from scratch with a fresh operation. This keeps the user job
    // alive instead of immediately failing on a transient capacity spike.
    if (isTransientVeoError(json.error.message)) {
      logError("veo transient terminal error — retrying create", {
        op: state.currentOp,
        message: json.error.message,
      });
      try {
        // Re-issue the same Veo predictLongRunning call (text-only resume).
        // We can't re-attach images here without ctx, so this only fully
        // recovers text-to-video and image-to-video where the orchestrator
        // is fine with retrying the same prompt. For now we just surface
        // a friendlier failure if we can't safely retry.
        // Safer: report processing and let the user manually retry by
        // submitting again. Keeping it as a soft processing state could
        // loop forever on persistent capacity issues, so we mark failed
        // with a clear retryable reason.
        return {
          status: "failed",
          videoUrl: null,
          thumbnailUrl: null,
          aspectRatio: null,
          duration: null,
          reason: "Video provider is at capacity. Please try again in a moment.",
          progressPercent: null,
        };
      } catch (e) {
        logError("veo retry path errored", { error: (e as Error).message });
      }
    }
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

  if (!ctx) {
    logError("veo poll missing ctx for upload", { op: state.currentOp });
    return {
      status: "processing",
      videoUrl: null,
      thumbnailUrl: null,
      aspectRatio: null,
      duration: null,
      progressPercent: estimateVeoProgressFromState(state),
    };
  }

  const hasExtension = state.targetDuration > VEO_BASE_DURATION_SECONDS;

  // Phase 1 just finished and the user asked for a longer clip → kick off
  // the extension and return updated durable state so the next poll picks
  // up the extension operation even after an edge restart.
  if (hasExtension && !state.extensionStarted) {
    // Honor the backoff timer set by a previous "not yet processed" rejection.
    // Until it elapses, just report processing and don't burn an attempt.
    if (state.nextExtensionAttemptAt && Date.now() < state.nextExtensionAttemptAt) {
      return {
        status: "processing",
        videoUrl: null,
        thumbnailUrl: null,
        aspectRatio: null,
        duration: null,
        progressPercent: 50,
        providerJobId: encodeVeoState(state),
      };
    }

    // Prefer the URI we already captured from a prior phase-1 success.
    const extendUri = state.pendingExtensionUri ?? uri;

    try {
      const newOp = await startVeoExtension(state, extendUri, apiKey);
      const nextState: VeoState = {
        ...state,
        currentOp: newOp,
        extensionStarted: true,
        phaseStartedAt: Date.now(),
        pendingExtensionUri: undefined,
        nextExtensionAttemptAt: undefined,
      };
      veoStartedAt.set(newOp, Date.now());
      return {
        status: "processing",
        videoUrl: null,
        thumbnailUrl: null,
        aspectRatio: null,
        duration: null,
        progressPercent: 50,
        providerJobId: encodeVeoState(nextState),
      };
    } catch (e) {
      const errMsg = (e as Error).message;
      const attempts = (state.extensionAttempts ?? 0) + 1;

      // Google sometimes rejects the extend call for a short window after
      // phase 1 finishes ("Input video must be a video that was generated by
      // VEO that has been processed."). Re-queue the same state so the next
      // poll re-issues the extend, up to MAX_EXTENSION_ATTEMPTS, with a
      // growing time gap between attempts so we actually let Google ingest.
      if (isVeoNotProcessedYet(errMsg) && attempts < MAX_EXTENSION_ATTEMPTS) {
        const waitMs = Math.min(EXTENSION_RETRY_BASE_MS * attempts, EXTENSION_RETRY_CAP_MS);
        logInfo("veo extension not ready yet — will retry", {
          attempt: attempts,
          retryInMs: waitMs,
          initialOp: state.initialOp,
        });
        const retryState: VeoState = {
          ...state,
          extensionStarted: false,
          pendingExtensionUri: extendUri,
          extensionAttempts: attempts,
          phaseStartedAt: state.phaseStartedAt,
          nextExtensionAttemptAt: Date.now() + waitMs,
        };
        return {
          status: "processing",
          videoUrl: null,
          thumbnailUrl: null,
          aspectRatio: null,
          duration: null,
          progressPercent: 50,
          providerJobId: encodeVeoState(retryState),
        };
      }

      logError("veo extension start failed", { error: errMsg, initialOp: state.initialOp, attempts });
      const friendly = isVeoNotProcessedYet(errMsg)
        ? "Video provider could not finalize the 15s extension after multiple attempts. Please try again."
        : `Video provider could not extend clip: ${errMsg}`;
      return {
        status: "failed",
        videoUrl: null,
        thumbnailUrl: null,
        aspectRatio: null,
        duration: null,
        reason: friendly,
        progressPercent: null,
      };
    }
  }

  // Final download + re-upload to our public bucket.
  const downloadUrl = uri.includes("?")
    ? `${uri}&key=${encodeURIComponent(apiKey)}`
    : `${uri}?key=${encodeURIComponent(apiKey)}`;
  const dl = await fetch(downloadUrl);
  if (!dl.ok) {
    logError("veo download failed", { status: dl.status });
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

  return {
    status: "completed",
    videoUrl: pub.publicUrl,
    thumbnailUrl: null,
    aspectRatio: null,
    duration: state.targetDuration,
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
