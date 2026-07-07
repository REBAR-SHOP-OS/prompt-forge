// External API Adapter — service implementation.
// Provider/model resolution + cost estimation + real provider calls.
// Wan provider uses Alibaba DashScope (Singapore) image-to-video API.
import type { SupabaseClient } from "../../core/supabase.ts";
import { getServiceClient } from "../../core/supabase.ts";
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
  // Google Veo — pricing per second of generated video.
  // NOTE: the Veo 3.0 GA model ids were retired from the Gemini API
  // (predictLongRunning now 404s for them). Only the Veo 3.1 preview family is
  // available, so all flow routes resolve to these.
  "veo-3.1-fast-generate-preview": { perSecondUsd: 0.10 },
  "veo-3.1-generate-preview":      { perSecondUsd: 0.40 },
  "veo-3.1-lite-generate-preview": { perSecondUsd: 0.10 },
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
 *  Veo 3.1 Fast tier is preferred by default; we fall back to Veo 3.1
 *  Standard when the request *requires* a capability Fast does not support:
 *   - first+last frame interpolation (lastFrame),
 *   - reference (character) images, or
 *   - durations > 8s, delivered via the Veo extension chain.
 *  NOTE: the Veo 3.0 model ids were retired from the Gemini API, so every
 *  flow route now resolves to a Veo 3.1 preview model. */
function resolveVeoModel(model: string, opts: ResolveRouteOptions = {}): string {
  const needs31 =
    Boolean(opts.hasLastFrame) ||
    Boolean(opts.hasReferenceImages) ||
    (opts.durationSeconds ?? 0) > 8;
  if (model === "flow-video-1") {
    return needs31 ? "veo-3.1-generate-preview" : "veo-3.1-fast-generate-preview";
  }
  if (model === "flow-video-1-pro") return "veo-3.1-generate-preview";
  // Legacy/retired Veo 3.0 ids → map onto the closest available 3.1 tier.
  if (model === "veo-3.0-fast-generate-001") return "veo-3.1-fast-generate-preview";
  if (model === "veo-3.0-generate-001") return "veo-3.1-generate-preview";
  return model;
}

/** Veo Fast cannot be extended. When a job needs more than a single 8s base
 *  clip (i.e. an extension chain), force the model up to Veo 3.1 Standard even
 *  if an alias/legacy route resolved to Fast. Keeps the fix independent of the
 *  route-preview path. */
function ensureVeoExtensionCapable(model: string, willExtend: boolean): string {
  if (willExtend && model === "veo-3.1-fast-generate-preview") {
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
const PROVIDER_START_TIMEOUT_MS = 45_000;
const LOCAL_VIDEO_MODELS = new Set([
  "local/wan-2.1-i2v",
  "local/wan-2.1-t2v",
  "local/ltx-video-i2v",
  "local/ltx-video-t2v",
]);

type LocalRouterType = "openai_compatible" | "comfyui";

type LocalVideoConfig =
  | {
      ok: true;
      routerType: LocalRouterType;
      baseUrl: string;
      /** Ordered list of full create URLs to attempt (first that isn't 404 wins). */
      createAttempts: string[];
      statusPath: string | null;
      outputPath: string | null;
      comfyWorkflowJson: string | null;
      apiKey: string | null;
      timeoutMs: number;
    }
  | { ok: false; error: string };

const COMFY_CREATE_PREFIXES = ["", "/api", "/api/v1", "/v1", "/comfy", "/comfyui"] as const;

// Clear, actionable messages reused by the adapter, the orchestrator preflight
// and the status endpoint so the UI always shows the same guidance.
export const LOCAL_NOT_CONFIGURED_MESSAGE =
  "Local video router is not configured. Add LOCAL_VIDEO_ROUTER_URL or choose a cloud model.";
export const LOCAL_UNREACHABLE_MESSAGE =
  "Local video router is unreachable. Check that the local router is running and accessible from the backend.";

const DEFAULT_LOCAL_VIDEO_TIMEOUT_MS = 300_000;

function readLocalVideoTimeoutMs(): number {
  const raw = Number(Deno.env.get("LOCAL_VIDEO_ROUTER_TIMEOUT_MS"));
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : DEFAULT_LOCAL_VIDEO_TIMEOUT_MS;
}

/** Join a base URL and a path safely, collapsing duplicate slashes. */
function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = (path.startsWith("/") ? path : `/${path}`).replace(/\/{2,}/g, "/");
  return `${b}${p}`;
}

/** Path portion of a full URL (host omitted so we never leak the router host). */
function urlPath(fullUrl: string): string {
  try {
    return new URL(fullUrl).pathname || "/";
  } catch {
    return fullUrl;
  }
}

function addUrlAttempt(target: Set<string>, fullUrl: string) {
  target.add(fullUrl);
  try {
    const parsed = new URL(fullUrl);
    if (!parsed.pathname.endsWith("/")) {
      parsed.pathname = `${parsed.pathname}/`.replace(/\/+/g, "/");
      target.add(parsed.toString().replace(/\/$/, "/"));
    }
  } catch {
    // Ignore malformed derived attempts; the original URL is already present.
  }
}

function readLocalRouterType(): LocalRouterType {
  const raw = (Deno.env.get("LOCAL_VIDEO_ROUTER_TYPE") ?? "openai_compatible").trim().toLowerCase();
  return raw === "comfyui" ? "comfyui" : "openai_compatible";
}

/** True when the error is a network/abort failure (router down/unreachable),
 *  as opposed to an HTTP error response from a reachable router. */
function isUnreachableError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof TypeError) return true; // fetch network failure
  const msg = (err as Error)?.message?.toLowerCase() ?? "";
  return /network|fetch failed|connection|timed out|timeout|dns|refused|unreachable|aborted/.test(msg);
}

/** Fetch with the configured local-router timeout via AbortController. */
async function localVideoFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sanitizePrompt(p: string): string {
  return p.replace(/\s+/g, " ").trim();
}

async function providerStartFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_START_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("Provider did not accept the job before the start timeout. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Provider capability helpers -------------------------------------------
// Centralize which providers/models can accept which kinds of image
// conditioning, so reference-image continuity logic stays explicit instead of
// scattered across each start* function.
//
//  - supportsStartImage:      can take a first-frame/start image (continuation).
//  - supportsReferenceImages: can take separate persistent reference/identity
//                             images (distinct from the start frame).
//
// Only Veo 3.1 exposes a true, dedicated reference-image input today. Wan
// (DashScope) and the local routers accept a start frame but have no proven
// dedicated reference-image channel, so they fall back to prompt augmentation.
function supportsStartImage(providerKey: ProviderKey, resolvedModel: string): boolean {
  if (providerKey === "flow") {
    // Veo text-to-video resolves with no frame; i2v paths pass a firstFrameUrl.
    return true;
  }
  if (providerKey === "wan") return !isWanTextToVideoModel(resolvedModel);
  if (providerKey === "local") return /i2v/i.test(resolvedModel);
  return false;
}

function supportsReferenceImages(providerKey: ProviderKey, resolvedModel: string): boolean {
  // Veo 3.1 (resolved from flow aliases) supports dedicated referenceImages.
  // Veo Fast (veo-3.0-fast-*) does NOT, but startVeo upgrades to 3.1 whenever
  // references are present, so we report true for the flow provider here and
  // let startVeo gate on the concrete model.
  if (providerKey === "flow") return true;
  // No other provider has a proven dedicated reference-image input.
  return false;
}

/** Append a strict character-identity lock to the prompt for providers that
 *  cannot accept dedicated reference images. The URLs are included so a
 *  prompt-aware router can fetch them; the strict wording keeps the subject's
 *  face, body, and full wardrobe identical across chained cards. */
function augmentPromptWithReferences(prompt: string, referenceImageUrls?: string[] | null): string {
  if (!referenceImageUrls || referenceImageUrls.length === 0) return prompt;
  const refs = referenceImageUrls.slice(0, 3).join(", ");
  const lock = [
    "CHARACTER IDENTITY LOCK (highest priority):",
    "The main character MUST be the exact same person as in the reference image(s):",
    `${refs}.`,
    "Keep the identical face, head, hairstyle, skin/body, proportions, and the EXACT same outfit —",
    "same clothing items, same colors, same logos/prints, same trousers, same shoes and accessories.",
    "Do NOT change, restyle, recolor, swap, add, or remove any clothing or accessory.",
    "Do NOT redesign the character. Only the pose, action, camera, and environment may change.",
  ].join(" ");
  return sanitizePrompt(`${lock}\n\n${prompt}`);
}



function getProviderApiKey(providerKey: ProviderKey): string | null {
  if (providerKey === "flow") {
    return Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("FLOW_API_KEY") ?? null;
  }
  if (providerKey === "wan") return Deno.env.get("WAN_API_KEY") ?? null;
  if (providerKey === "local") {
    return (
      Deno.env.get("LOCAL_VIDEO_ROUTER_TOKEN") ??
      Deno.env.get("LOCAL_VIDEO_API_KEY") ??
      Deno.env.get("LOCAL_AI_ROUTER_TOKEN") ??
      Deno.env.get("LOCAL_IMAGE_API_KEY") ??
      Deno.env.get("LOCAL_LLM_API_KEY") ??
      null
    );
  }
  return null;
}

function allowMockGeneration(): boolean {
  return getEnv("ALLOW_MOCK_GENERATION", false).toLowerCase() === "true";
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("127.") ||
    host.endsWith(".localhost")
  );
}

function readLocalVideoConfig(): LocalVideoConfig {
  // Only use a dedicated video router URL. Do NOT fall back to the LLM or
  // image router URLs — those have no /videos/generations endpoint and would
  // produce a misleading 404 instead of a clear "not configured" error.
  const rawBaseUrl = (
    Deno.env.get("LOCAL_VIDEO_ROUTER_URL") ??
    Deno.env.get("LOCAL_VIDEO_BASE_URL") ??
    Deno.env.get("LOCAL_AI_ROUTER_BASE_URL") ??
    ""
  ).trim();

  if (!rawBaseUrl) {
    return { ok: false, error: LOCAL_NOT_CONFIGURED_MESSAGE };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    return { ok: false, error: LOCAL_NOT_CONFIGURED_MESSAGE };
  }

  if (isLoopbackHost(parsed.hostname) && Deno.env.get("ALLOW_LOCAL_VIDEO_LOOPBACK") !== "true") {
    return { ok: false, error: LOCAL_NOT_CONFIGURED_MESSAGE };
  }
  if (parsed.protocol !== "https:" && Deno.env.get("ALLOW_LOCAL_VIDEO_HTTP") !== "true") {
    return { ok: false, error: LOCAL_NOT_CONFIGURED_MESSAGE };
  }

  const routerType = readLocalRouterType();
  const baseUrl = parsed.toString().replace(/\/+$/, "");
  const apiKey = getProviderApiKey("local");
  const timeoutMs = readLocalVideoTimeoutMs();
  const statusPath = (Deno.env.get("LOCAL_VIDEO_ROUTER_STATUS_PATH") ?? "").trim() || null;
  const outputPath = (Deno.env.get("LOCAL_VIDEO_ROUTER_OUTPUT_PATH") ?? "").trim() || null;
  const comfyWorkflowJson = (Deno.env.get("LOCAL_VIDEO_COMFY_WORKFLOW_JSON") ?? "").trim() || null;
  const createPathEnv = (Deno.env.get("LOCAL_VIDEO_ROUTER_CREATE_PATH") ?? "").trim();

  let createAttempts: string[];
  if (routerType === "comfyui") {
    // ComfyUI: collect explicit path (if set) plus default fallbacks.
    // Some reverse proxies expose the endpoint under /api, /v1, /comfy, etc.
    // Also guard against double paths when the base URL already ends with
    // one of the known create endpoints.
    const comfyPaths = new Set<string>();
    if (createPathEnv) {
      addUrlAttempt(comfyPaths, joinUrl(baseUrl, createPathEnv));
    }
    const defaults = COMFY_CREATE_PREFIXES.map((prefix) => `${prefix}/prompt`);
    for (const p of defaults) {
      addUrlAttempt(comfyPaths, joinUrl(baseUrl, p));
    }
    // If the base URL itself already looks like a ComfyUI endpoint, try it too.
    const basePath = parsed.pathname.replace(/\/+$/, "");
    for (const p of defaults) {
      if (basePath === p || basePath.endsWith(p)) {
        addUrlAttempt(comfyPaths, baseUrl);
      }
    }
    createAttempts = Array.from(comfyPaths);
  } else if (createPathEnv) {
    // Explicit create path for openai_compatible routers.
    createAttempts = [joinUrl(baseUrl, createPathEnv)];
  } else {
    // openai_compatible defaults — preserve legacy /v1 handling and the
    // exact-route detection for URLs that already include the endpoint.
    const pathname = parsed.pathname.replace(/\/+$/, "");
    if (pathname.endsWith("/videos/generations") || pathname.endsWith("/videos")) {
      createAttempts = [baseUrl];
    } else {
      const apiBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
      createAttempts = [`${apiBase}/videos/generations`, `${apiBase}/videos`];
    }
  }

  return { ok: true, routerType, baseUrl, createAttempts, statusPath, outputPath, comfyWorkflowJson, apiKey, timeoutMs };
}

export interface LocalVideoStatusReport {
  status: "configured" | "not_configured" | "unreachable";
  message: string;
  configured: boolean;
  reachable: boolean | null;
  create_endpoint_found: boolean | null;
  attempted_create_paths: string[];
  router_type: LocalRouterType | null;
  /** Present when discover=true: ComfyUI signature endpoints that responded
   *  (HTTP < 400) on a GET, revealing the real API base path to configure. */
  discovered_endpoints?: string[];
}

/** Probe ComfyUI's well-known GET endpoints to find the real API base path.
 *  Returns the relative paths (host omitted) that answered with HTTP < 400. */
async function discoverComfyEndpoints(config: Extract<LocalVideoConfig, { ok: true }>): Promise<string[]> {
  // ComfyUI signature routes. Cover bare root and common reverse-proxy
  // prefixes (/api, /comfy, /comfyui) so a prefixed deployment is detected.
  const signatures = ["/system_stats", "/object_info", "/queue", "/history", "/prompt"];
  const prefixes = ["", "/api", "/comfy", "/comfyui", "/v1"];
  const candidates = new Set<string>();
  for (const prefix of prefixes) {
    for (const sig of signatures) {
      candidates.add(joinUrl(config.baseUrl, `${prefix}${sig}`));
    }
  }
  const found: string[] = [];
  for (const url of candidates) {
    try {
      const res = await localVideoFetch(
        url,
        { method: "GET", headers: localVideoHeaders(config) },
        Math.min(config.timeoutMs, 8_000),
      );
      const text = await res.text().catch(() => "");
      let payload: unknown = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
      const path = urlPath(url);
      if (res.status < 400 && isLikelyComfySignature(path, payload, res.headers.get("content-type"))) {
        found.push(path);
      }
    } catch {
      // ignore unreachable individual probes
    }
  }
  return found;
}

function isLikelyComfySignature(path: string, payload: unknown, contentType: string | null): boolean {
  // Many tunnel/front-end deployments return a 200 HTML SPA shell for any GET
  // path. Treating that as discovery creates false confidence while POST
  // /prompt still 404s. Only count JSON responses with ComfyUI-shaped fields.
  if (!contentType?.toLowerCase().includes("json")) return false;
  const rec = localVideoRecord(payload);
  if (path.endsWith("/prompt")) return Boolean(localVideoRecord(rec.exec_info).queue_remaining !== undefined);
  if (path.endsWith("/queue")) return "queue_running" in rec || "queue_pending" in rec;
  if (path.endsWith("/system_stats")) return "system" in rec || "devices" in rec;
  if (path.endsWith("/object_info")) return Object.keys(rec).length > 0;
  if (path.endsWith("/history")) return payload !== null && typeof payload === "object" && !Array.isArray(payload);
  return false;
}


/** Lightweight, no-secret config/health status for the local video router.
 *  Used by the orchestrator preflight and the status endpoint. When
 *  `probe` is true and configured, it checks reachability AND whether a
 *  create endpoint exists (without running a real generation). */
export async function localVideoStatus(
  probe = false,
  discover = false,
): Promise<LocalVideoStatusReport> {
  const config = readLocalVideoConfig();
  if (!config.ok) {
    return {
      status: "not_configured",
      message: config.error,
      configured: false,
      reachable: null,
      create_endpoint_found: null,
      attempted_create_paths: [],
      router_type: null,
    };
  }

  const attemptedPaths = config.createAttempts.map((u) => `POST ${urlPath(u)}`);

  if (!probe) {
    return {
      status: "configured",
      message: "Local video router is configured.",
      configured: true,
      reachable: null,
      create_endpoint_found: null,
      attempted_create_paths: attemptedPaths,
      router_type: config.routerType,
    };
  }

  // Probe each candidate create endpoint with a lightweight POST so we verify
  // the same HTTP method the real generation path uses. A reachable router
  // answers (any non-404 status) which proves the path exists; 404 means
  // missing. Timeouts/abort still count as unreachable.
  let reachable = false;
  let createFound = false;
  for (const url of config.createAttempts) {
    try {
      const res = await localVideoFetch(
        url,
        {
          method: "POST",
          headers: localVideoHeaders(config),
          body: JSON.stringify({
            prompt: {},
            client_id: "local-video-status-probe",
          }),
        },
        Math.min(config.timeoutMs, 10_000),
      );
      reachable = true;
      await res.body?.cancel().catch(() => {});
      if (res.status !== 404) {
        createFound = true;
        break;
      }
    } catch (err) {
      if (!isUnreachableError(err)) {
        // Non-network error against a responding host still implies reachable.
        reachable = true;
      }
    }
  }

  if (!reachable) {
    return {
      status: "unreachable",
      message: LOCAL_UNREACHABLE_MESSAGE,
      configured: true,
      reachable: false,
      create_endpoint_found: null,
      attempted_create_paths: attemptedPaths,
      router_type: config.routerType,
    };
  }

  const discovered = discover ? await discoverComfyEndpoints(config) : undefined;

  return {
    status: "configured",
    message: createFound
      ? "Local video router is reachable and a create endpoint was found."
      : discovered && discovered.length > 0
      ? `Local router is reachable. ComfyUI signature endpoints responded at: ${discovered.join(", ")}. Set LOCAL_VIDEO_ROUTER_URL so its base + /prompt matches one of these (or set LOCAL_VIDEO_ROUTER_CREATE_PATH accordingly).`
      : `Local router is reachable, but no video create endpoint was found. Tried: ${attemptedPaths.join(", ")}. Set LOCAL_VIDEO_ROUTER_CREATE_PATH to your router's create endpoint, for example /prompt for ComfyUI.`,
    configured: true,
    reachable: true,
    create_endpoint_found: createFound,
    attempted_create_paths: attemptedPaths,
    router_type: config.routerType,
    ...(discovered ? { discovered_endpoints: discovered } : {}),
  };
}




function isLocalVideoModel(model: string): boolean {
  return LOCAL_VIDEO_MODELS.has(model);
}

function localVideoHeaders(config: Extract<LocalVideoConfig, { ok: true }>): HeadersInit {
  return {
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    "Accept": "application/json",
    "Content-Type": "application/json",
    // Required by ngrok browser-warning interstitials and harmless elsewhere.
    "ngrok-skip-browser-warning": "true",
  };
}

function localVideoText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function localVideoNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function localVideoRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function localVideoArrayRecord(value: unknown, key: string): Record<string, unknown> {
  const child = localVideoRecord(value)[key];
  return Array.isArray(child) ? localVideoRecord(child[0]) : {};
}

function extractLocalVideoUrl(payload: unknown): string | null {
  const p = localVideoRecord(payload);
  const output = localVideoRecord(p.output);
  const data0 = localVideoArrayRecord(payload, "data");
  return (
    localVideoText(p.video_url) ??
    localVideoText(p.videoUrl) ??
    localVideoText(p.url) ??
    localVideoText(output.video_url) ??
    localVideoText(output.videoUrl) ??
    localVideoText(data0.url) ??
    localVideoText(data0.video_url) ??
    localVideoText(data0.videoUrl) ??
    null
  );
}

function extractLocalThumbnailUrl(payload: unknown): string | null {
  const p = localVideoRecord(payload);
  const data0 = localVideoArrayRecord(payload, "data");
  return (
    localVideoText(p.thumbnail_url) ??
    localVideoText(p.thumbnailUrl) ??
    localVideoText(data0.thumbnail_url) ??
    localVideoText(data0.thumbnailUrl) ??
    null
  );
}

function extractLocalJobId(payload: unknown): string | null {
  const p = localVideoRecord(payload);
  const output = localVideoRecord(p.output);
  return (
    localVideoText(p.id) ??
    localVideoText(p.job_id) ??
    localVideoText(p.jobId) ??
    localVideoText(p.task_id) ??
    localVideoText(p.taskId) ??
    localVideoText(p.provider_job_id) ??
    localVideoText(p.providerJobId) ??
    localVideoText(p.prompt_id) ??
    localVideoText(p.promptId) ??
    localVideoText(output.task_id) ??
    null
  );
}

function normalizeLocalStatus(payload: unknown): GenerationPollResult["status"] {
  const p = localVideoRecord(payload);
  const output = localVideoRecord(p.output);
  const raw = String(
    p.status ??
    p.state ??
    output.task_status ??
    p.task_status ??
    "",
  ).toLowerCase();
  if (["completed", "complete", "succeeded", "success", "done"].includes(raw)) return "completed";
  if (["failed", "failure", "error", "cancelled", "canceled"].includes(raw)) return "failed";
  if (["pending", "queued", "created"].includes(raw)) return "pending";
  return "processing";
}

async function resolveRoute(
  svc: SupabaseClient,
  providerKey: ProviderKey,
  requestedModel: string | undefined,
  prompt: string,
  opts: ResolveRouteOptions = {},
): Promise<ResolvedRoute> {
  if (providerKey === "local") {
    const resolvedModel = requestedModel?.trim() || "local/wan-2.1-i2v";
    if (!isLocalVideoModel(resolvedModel)) {
      throw new Error(`unsupported local video model: ${resolvedModel}`);
    }
    return { providerKey, resolvedModel, estimatedCost: 0 };
  }

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
  if (input.firstFrameUrl) {
    media.push({ type: "first_frame", url: await resolveDownloadableFrameUrl(input.firstFrameUrl) });
  }
  if (input.lastFrameUrl) {
    media.push({ type: "last_frame", url: await resolveDownloadableFrameUrl(input.lastFrameUrl) });
  }

  // Wan (DashScope) i2v has no dedicated reference-image channel — media[]
  // only carries first/last frames. Keep firstFrameUrl as the continuation
  // anchor and fold persistent character identity into the prompt as a
  // non-breaking fallback so the subject stays consistent across cards.
  const hasReference = Boolean(input.referenceImageUrls && input.referenceImageUrls.length > 0);
  const wanPrompt = augmentPromptWithReferences(input.prompt, input.referenceImageUrls);

  const body = {
    model: resolvedModel,
    input: {
      prompt: wanPrompt,
      media,
    },

    parameters: {
      resolution: "720P",
      ratio: input.aspectRatio ?? "16:9",
      duration: input.durationSeconds ?? 5,
      // Provider prompt expansion can reinterpret/restyle the character's
      // wardrobe. When a Character Sheet anchor is present, keep the strict
      // identity-lock prompt verbatim instead of letting Wan rewrite it.
      prompt_extend: !hasReference,
      watermark: false,
    },
  };

  const res = await providerStartFetch(`${DASHSCOPE_BASE_URL}${DASHSCOPE_CREATE_PATH}`, {
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

  const res = await providerStartFetch(`${DASHSCOPE_BASE_URL}${DASHSCOPE_CREATE_PATH}`, {
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
    const providerCode = json.output?.code ?? json.code ?? "";
    const providerMessage = json.output?.message ?? json.message ?? `task ${status.toLowerCase()}`;
    // DashScope content moderation ("green net") rejects the prompt or start
    // image. Surface a clear, actionable message so the user knows to reword
    // the prompt / swap the image instead of seeing a bare provider error.
    const isModeration = /DataInspectionFailed|green net|inappropriate content/i.test(
      `${providerCode} ${providerMessage}`,
    );
    const reason = isModeration
      ? "This scene was blocked by the video provider's content filter. Reword the prompt (avoid brand names, real people, logos, or sensitive wording) or change the start image, then try again."
      : providerMessage;
    return {
      status: "failed",
      videoUrl: null,
      thumbnailUrl: null,
      aspectRatio: null,
      duration: null,
      reason,
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
  // Frames are commonly staged into our OWN (private) Supabase Storage buckets
  // — e.g. `wan-frames/<userId>/scene-chain-...png` used for >15s scene chaining.
  // A `getPublicUrl()` on a private bucket yields a `/object/public/...` URL that
  // an unauthenticated fetch cannot download (returns 400), which surfaced as
  // "Failed to download …scene-chain-…png" on chained cards. Download those via
  // the service-role client instead. This also works for `/object/sign/...`
  // URLs and is immune to signed-URL expiry during long extension/queue waits.
  const ownStorage = parseOwnStorageObject(url);
  if (ownStorage) {
    const client = getServiceClient();
    const { data, error } = await client.storage
      .from(ownStorage.bucket)
      .download(ownStorage.key);
    if (error || !data) {
      throw new Error(
        `failed to download frame from storage ${ownStorage.bucket}/${ownStorage.key}: ${
          error?.message ?? "no data"
        }`,
      );
    }
    const mimeType = data.type?.split(";")[0]?.trim() || "image/png";
    const buf = new Uint8Array(await data.arrayBuffer());
    return { mimeType, data: bytesToBase64(buf) };
  }

  const r = await fetch(url);
  if (!r.ok) throw new Error(`failed to fetch frame ${url}: ${r.status}`);
  const mimeType = r.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const buf = new Uint8Array(await r.arrayBuffer());
  return { mimeType, data: bytesToBase64(buf) };
}

/**
 * Ensure a frame URL is downloadable by an EXTERNAL provider (e.g. DashScope),
 * which fetches the URL itself over plain HTTP with no auth.
 *
 * Scene-chain / reframe frames are staged into our own Supabase Storage. The
 * `wan-frames` bucket is PRIVATE, so a `getPublicUrl()` `/object/public/...`
 * link returns 400 to an unauthenticated fetch — which surfaced as
 * "Failed to download …scene-chain-…png" on chained cards. For own-storage
 * objects we mint a time-limited signed URL with the service-role client so the
 * provider can download it regardless of the bucket's public/private setting.
 * Genuinely external URLs are returned unchanged.
 */
async function resolveDownloadableFrameUrl(url: string): Promise<string> {
  const ownStorage = parseOwnStorageObject(url);
  if (!ownStorage) return url;
  try {
    const client = getServiceClient();
    // 6h covers long extension/queue waits before the provider downloads it.
    const { data, error } = await client.storage
      .from(ownStorage.bucket)
      .createSignedUrl(ownStorage.key, 6 * 60 * 60);
    if (error || !data?.signedUrl) return url;
    return data.signedUrl;
  } catch {
    return url;
  }
}

/**
 * If `url` points to THIS project's Supabase Storage object API, return its
 * bucket + key so we can download with the service-role client. Otherwise null
 * (genuinely external URL — fall back to a plain fetch).
 */
function parseOwnStorageObject(url: string): { bucket: string; key: string } | null {
  let supabaseUrl: string;
  try {
    supabaseUrl = getEnv("SUPABASE_URL");
  } catch {
    return null;
  }
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(url);
    base = new URL(supabaseUrl);
  } catch {
    return null;
  }
  if (parsed.host !== base.host) return null;
  // Matches /storage/v1/object/{public|sign|authenticated}/<bucket>/<key...>
  const m = parsed.pathname.match(
    /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/,
  );
  if (!m) return null;
  const bucket = decodeURIComponent(m[1]);
  const key = decodeURIComponent(m[2]);
  if (!bucket || !key) return null;
  return { bucket, key };
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
  const hasReferenceImages = Boolean(input.referenceImageUrls && input.referenceImageUrls.length > 0);
  const veoModel = ensureVeoExtensionCapable(
    resolveVeoModel(resolvedModel, {
      durationSeconds: requested,
      hasLastFrame: Boolean(input.lastFrameUrl),
      hasReferenceImages,
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
    const frame = await fetchAsInlineData(input.lastFrameUrl);
    if (!input.firstFrameUrl) {
      // "End only" mode: Veo requires an initial `image` for generation and does
      // not support a lone `lastFrame`. Anchor the generation on the user's End
      // frame (image-to-video) instead of sending an invalid last-frame-only
      // request that Veo rejects with a 400. Safe, non-breaking fallback.
      logInfo("veo: last-frame-only request promoted to image-to-video anchor", {
        model: veoModel,
      });
      instance.image = { bytesBase64Encoded: frame.data, mimeType: frame.mimeType };
    } else {
      // Veo 3.1 supports first+last frame interpolation via the `lastFrame` field.
      instance.lastFrame = { bytesBase64Encoded: frame.data, mimeType: frame.mimeType };
    }
  }


  // Persistent identity anchor: forward reference (Character Sheet) images so
  // the subject stays consistent across chained cards. Veo 3.1 only; capped at 3.
  // Best-effort — a failed fetch for a reference image must never break the job.
  if (input.referenceImageUrls && input.referenceImageUrls.length > 0) {
    const references: Array<Record<string, unknown>> = [];
    for (const url of input.referenceImageUrls.slice(0, 3)) {
      try {
        const ref = await fetchAsInlineData(url);
        references.push({
          image: { bytesBase64Encoded: ref.data, mimeType: ref.mimeType },
          referenceType: "asset",
        });
      } catch (e) {
        logError("veo reference image fetch failed, skipping", {
          error: (e as Error).message,
        });
      }
    }
    if (references.length > 0) instance.referenceImages = references;
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

  const res = await providerStartFetch(
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

  const res = await providerStartFetch(
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

async function startLocalVideo(
  resolvedModel: string,
  input: GenerationStartInput,
): Promise<GenerationStartResult> {
  if (!isLocalVideoModel(resolvedModel)) {
    throw new Error(`Unsupported local video model: ${resolvedModel}`);
  }
  const config = readLocalVideoConfig();
  if (!config.ok) throw new Error(config.error);
  const localConfig = config;

  // Local routers (Wan/LTX on ComfyUI) drive clip length via num_frames + fps,
  // not seconds. Without these they fall back to their default (~1s) clip and
  // silently ignore the requested duration. Compute frames from the selected
  // duration and a configurable fps (default 16, Wan 2.1's native rate).
  const fpsRaw = Number(Deno.env.get("LOCAL_VIDEO_FPS"));
  const fps = Number.isFinite(fpsRaw) && fpsRaw > 0 ? Math.round(fpsRaw) : 16;
  const seconds = input.durationSeconds && input.durationSeconds > 0 ? input.durationSeconds : 5;
  const numFrames = Math.max(1, Math.round(seconds * fps));

  const refs = (input.referenceImageUrls ?? []).filter((u) => typeof u === "string" && u.trim());
  const localPrompt = augmentPromptWithReferences(input.prompt, refs);

  // ---- ComfyUI mode ---------------------------------------------------------
  if (localConfig.routerType === "comfyui") {
    return await startComfyVideo(localConfig, resolvedModel, input, {
      prompt: localPrompt,
      fps,
      seconds,
      numFrames,
    });
  }

  // ---- OpenAI-compatible mode ----------------------------------------------
  const body = {
    model: resolvedModel,
    prompt: localPrompt,
    image_url: input.firstFrameUrl ?? input.lastFrameUrl ?? null,
    first_frame_url: input.firstFrameUrl ?? null,
    last_frame_url: input.lastFrameUrl ?? null,
    // Non-breaking reference passthrough — ignored by routers that don't read it.
    reference_image_urls: refs.length > 0 ? refs : undefined,
    duration: seconds,
    duration_seconds: seconds,
    // Frame-count fields — send several common aliases so different local
    // routers all honor the requested length.
    num_frames: numFrames,
    frames: numFrames,
    fps: fps,
    length: seconds,
    seconds: seconds,
    aspect_ratio: input.aspectRatio ?? "16:9",
    response_format: "url",
  };

  async function postCreate(url: string): Promise<Response> {
    return await localVideoFetch(url, {
      method: "POST",
      headers: localVideoHeaders(localConfig),
      body: JSON.stringify(body),
    }, localConfig.timeoutMs);
  }

  // Try each configured create attempt in order. A 404 means "wrong path on a
  // reachable router" — move on to the next candidate. Any non-404 response
  // (success or a real error) is the authoritative one we act on.
  const attempted = localConfig.createAttempts.map((u) => `POST ${urlPath(u)}`);
  let res: Response | null = null;
  try {
    for (let i = 0; i < localConfig.createAttempts.length; i++) {
      const url = localConfig.createAttempts[i];
      const candidate = await postCreate(url);
      if (candidate.status === 404 && i < localConfig.createAttempts.length - 1) {
        logInfo("local video create fallback", {
          from: urlPath(url),
          to: urlPath(localConfig.createAttempts[i + 1]),
          model: resolvedModel,
        });
        await candidate.body?.cancel().catch(() => {});
        continue;
      }
      res = candidate;
      break;
    }
  } catch (err) {
    logError("local video create unreachable", { error: (err as Error).message, model: resolvedModel });
    if (isUnreachableError(err)) throw new Error(LOCAL_UNREACHABLE_MESSAGE);
    throw err;
  }

  if (!res) {
    throw new Error("Local video router returned no response");
  }

  const text = await res.text().catch(() => "");
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    logError("local video create failed", { status: res.status, body: text.slice(0, 500), model: resolvedModel });
    if (res.status === 404) {
      throw new Error(
        `Local router is reachable, but no video create endpoint was found. Tried: ${attempted.join(", ")}. Set LOCAL_VIDEO_ROUTER_CREATE_PATH to your router's create endpoint, for example /prompt for ComfyUI.`,
      );
    }
    throw new Error(`Local video router ${res.status}: ${text.slice(0, 300) || "unknown error"}`);
  }

  const videoUrl = extractLocalVideoUrl(payload);
  if (videoUrl) {
    return {
      providerJobId: `local_sync_${crypto.randomUUID()}`,
      videoUrl,
      thumbnailUrl: extractLocalThumbnailUrl(payload),
      aspectRatio: input.aspectRatio ?? null,
      duration: input.durationSeconds ?? null,
      isComplete: true,
    };
  }

  const jobId = extractLocalJobId(payload);
  if (!jobId) {
    throw new Error("Local video router returned no video URL or job id");
  }

  return {
    providerJobId: `local:${jobId}`,
    videoUrl: null,
    thumbnailUrl: null,
    aspectRatio: input.aspectRatio ?? null,
    duration: input.durationSeconds ?? null,
    isComplete: false,
  };
}

// ----- ComfyUI -------------------------------------------------------------
// ComfyUI generates from a workflow graph (API format), not a generic JSON
// body. The graph MUST be provided via LOCAL_VIDEO_COMFY_WORKFLOW_JSON so we
// never pretend ComfyUI can render video without one. Placeholders inside the
// workflow JSON are substituted before submission:
//   {{PROMPT}} {{NEGATIVE_PROMPT}} {{IMAGE_URL}} {{NUM_FRAMES}} {{FPS}}
//   {{SECONDS}} {{ASPECT_RATIO}} {{SEED}}
function buildComfyWorkflow(
  raw: string,
  vars: Record<string, string | number>,
): unknown {
  let substituted = raw;
  for (const [key, value] of Object.entries(vars)) {
    // JSON-safe replacement: numbers stay numeric, strings are escaped.
    const token = `{{${key}}}`;
    const replacement = typeof value === "number"
      ? String(value)
      : JSON.stringify(value).slice(1, -1); // escape but keep surrounding quotes from JSON
    substituted = substituted.split(token).join(replacement);
  }
  return JSON.parse(substituted);
}

async function startComfyVideo(
  config: Extract<LocalVideoConfig, { ok: true }>,
  resolvedModel: string,
  input: GenerationStartInput,
  derived: { prompt: string; fps: number; seconds: number; numFrames: number },
): Promise<GenerationStartResult> {
  if (!config.comfyWorkflowJson) {
    throw new Error(
      "ComfyUI workflow not configured. Set LOCAL_VIDEO_COMFY_WORKFLOW_JSON to your ComfyUI API-format workflow graph (use placeholders like {{PROMPT}}, {{IMAGE_URL}}, {{NUM_FRAMES}}, {{FPS}}, {{SEED}}).",
    );
  }

  const imageUrl = input.firstFrameUrl ?? input.lastFrameUrl ?? "";
  // Image-to-video requires a start frame for the i2v models the UI exposes.
  if (/i2v/i.test(resolvedModel) && !imageUrl) {
    throw new Error("Local ComfyUI image-to-video requires a start image, but none was provided.");
  }

  let workflow: unknown;
  try {
    workflow = buildComfyWorkflow(config.comfyWorkflowJson, {
      PROMPT: derived.prompt,
      NEGATIVE_PROMPT: "",
      IMAGE_URL: imageUrl,
      NUM_FRAMES: derived.numFrames,
      FPS: derived.fps,
      SECONDS: derived.seconds,
      ASPECT_RATIO: input.aspectRatio ?? "16:9",
      SEED: Math.floor(Math.random() * 2_147_483_647),
    });
  } catch (err) {
    throw new Error(`Invalid LOCAL_VIDEO_COMFY_WORKFLOW_JSON after substitution: ${(err as Error).message}`);
  }

  const attempted = config.createAttempts.map((u) => `POST ${urlPath(u)}`);
  let res: Response | null = null;
  try {
    for (let i = 0; i < config.createAttempts.length; i++) {
      const url = config.createAttempts[i];
      const candidate = await localVideoFetch(url, {
        method: "POST",
        headers: localVideoHeaders(config),
        body: JSON.stringify({ prompt: workflow, client_id: "local-video-router" }),
      }, config.timeoutMs);
      if (candidate.status === 404 && i < config.createAttempts.length - 1) {
        logInfo("comfy create fallback", {
          from: urlPath(url),
          to: urlPath(config.createAttempts[i + 1]),
          model: resolvedModel,
        });
        await candidate.body?.cancel().catch(() => {});
        continue;
      }
      res = candidate;
      break;
    }
  } catch (err) {
    logError("comfy create unreachable", { error: (err as Error).message, model: resolvedModel });
    if (isUnreachableError(err)) throw new Error(LOCAL_UNREACHABLE_MESSAGE);
    throw err;
  }

  if (!res) {
    throw new Error(
      `Local router is reachable, but no video create endpoint was found. Tried: ${attempted.join(", ")}. Set LOCAL_VIDEO_ROUTER_CREATE_PATH to your ComfyUI create endpoint (default /prompt).`,
    );
  }

  const text = await res.text().catch(() => "");
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }

  if (!res.ok) {
    logError("comfy create failed", { status: res.status, body: text.slice(0, 500), model: resolvedModel });
    if (res.status === 404) {
      throw new Error(
        `Local router is reachable, but no video create endpoint was found. Tried: ${attempted.join(", ")}. Set LOCAL_VIDEO_ROUTER_CREATE_PATH to your ComfyUI create endpoint (default /prompt).`,
      );
    }
    throw new Error(`ComfyUI ${res.status}: ${text.slice(0, 300) || "unknown error"}`);
  }

  const rec = localVideoRecord(payload);
  const nodeErrors = localVideoRecord(rec.node_errors);
  if (Object.keys(nodeErrors).length > 0) {
    throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(nodeErrors).slice(0, 300)}`);
  }
  const promptId = localVideoText(rec.prompt_id) ?? extractLocalJobId(payload);
  if (!promptId) {
    throw new Error("ComfyUI returned no prompt_id");
  }

  return {
    providerJobId: `localcomfy:${promptId}`,
    videoUrl: null,
    thumbnailUrl: null,
    aspectRatio: input.aspectRatio ?? null,
    duration: input.durationSeconds ?? null,
    isComplete: false,
  };
}

function extractComfyOutputUrl(
  config: Extract<LocalVideoConfig, { ok: true }>,
  entry: Record<string, unknown>,
): string | null {
  const outputs = localVideoRecord(entry.outputs);
  const viewBase = config.outputPath ?? "/view";
  for (const node of Object.values(outputs)) {
    const nodeRec = localVideoRecord(node);
    for (const key of ["gifs", "videos", "images"]) {
      const arr = nodeRec[key];
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        const f = localVideoRecord(item);
        const filename = localVideoText(f.filename);
        if (!filename) continue;
        // Prefer video-like outputs; skip plain preview images unless nothing else.
        const isVideo = /\.(mp4|webm|gif|mov|mkv)$/i.test(filename);
        if (key === "images" && !isVideo) continue;
        const subfolder = localVideoText(f.subfolder) ?? "";
        const type = localVideoText(f.type) ?? "output";
        const qs = new URLSearchParams({ filename, subfolder, type }).toString();
        return joinUrl(config.baseUrl, `${viewBase}?${qs}`);
      }
    }
  }
  return null;
}

async function pollComfyVideo(
  config: Extract<LocalVideoConfig, { ok: true }>,
  promptId: string,
): Promise<GenerationPollResult> {
  const statusBase = config.statusPath ?? "/history";
  const url = joinUrl(config.baseUrl, `${statusBase}/${encodeURIComponent(promptId)}`);
  let res: Response;
  try {
    res = await localVideoFetch(url, { method: "GET", headers: localVideoHeaders(config) }, config.timeoutMs);
  } catch (err) {
    if (isUnreachableError(err)) {
      logError("comfy poll unreachable", { error: (err as Error).message, promptId });
      return { status: "processing", videoUrl: null, thumbnailUrl: null, aspectRatio: null, duration: null, progressPercent: 25 };
    }
    throw err;
  }
  const text = await res.text().catch(() => "");
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }

  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) {
      return { status: "processing", videoUrl: null, thumbnailUrl: null, aspectRatio: null, duration: null, progressPercent: 25 };
    }
    return {
      status: "failed",
      videoUrl: null, thumbnailUrl: null, aspectRatio: null, duration: null,
      reason: `ComfyUI ${res.status}: ${text.slice(0, 300) || "unknown error"}`,
      progressPercent: null,
    };
  }

  const history = localVideoRecord(payload);
  const entry = localVideoRecord(history[promptId]);
  // Empty history for this id means it's still queued/running.
  if (Object.keys(entry).length === 0) {
    return { status: "processing", videoUrl: null, thumbnailUrl: null, aspectRatio: null, duration: null, progressPercent: 25 };
  }

  const statusRec = localVideoRecord(entry.status);
  const statusStr = String(statusRec.status_str ?? "").toLowerCase();
  if (statusStr === "error") {
    return {
      status: "failed",
      videoUrl: null, thumbnailUrl: null, aspectRatio: null, duration: null,
      reason: "ComfyUI workflow execution failed",
      progressPercent: null,
    };
  }

  const videoUrl = extractComfyOutputUrl(config, entry);
  const completed = statusRec.completed === true || !!videoUrl;
  if (completed && !videoUrl) {
    return {
      status: "failed",
      videoUrl: null, thumbnailUrl: null, aspectRatio: null, duration: null,
      reason: "ComfyUI completed but produced no video output",
      progressPercent: null,
    };
  }
  if (videoUrl) {
    return { status: "completed", videoUrl, thumbnailUrl: null, aspectRatio: null, duration: null, progressPercent: 100 };
  }
  return { status: "processing", videoUrl: null, thumbnailUrl: null, aspectRatio: null, duration: null, progressPercent: 40 };
}

async function pollLocalVideo(providerJobId: string): Promise<GenerationPollResult> {
  if (providerJobId.startsWith("local_sync_")) {
    return { status: "completed", videoUrl: null, thumbnailUrl: null, aspectRatio: null, duration: null, progressPercent: 100 };
  }

  const config = readLocalVideoConfig();
  if (!config.ok) {
    return {
      status: "failed",
      videoUrl: null,
      thumbnailUrl: null,
      aspectRatio: null,
      duration: null,
      reason: config.error,
      progressPercent: null,
    };
  }

  if (providerJobId.startsWith("localcomfy:")) {
    return await pollComfyVideo(config, providerJobId.slice("localcomfy:".length));
  }

  const jobId = providerJobId.startsWith("local:") ? providerJobId.slice("local:".length) : providerJobId;
  // Honor a custom status path when set; otherwise use the OpenAI-style route.
  const statusUrl = config.statusPath
    ? joinUrl(config.baseUrl, `${config.statusPath}/${encodeURIComponent(jobId)}`)
    : joinUrl(config.baseUrl, `/v1/videos/generations/${encodeURIComponent(jobId)}`);
  let res: Response;
  try {
    res = await localVideoFetch(statusUrl, {
      method: "GET",
      headers: localVideoHeaders(config),
    }, config.timeoutMs);
  } catch (err) {
    // Router unreachable mid-poll: keep the job processing so a transient
    // outage doesn't fail an in-flight render. The stuck-timeout still applies.
    if (isUnreachableError(err)) {
      logError("local video poll unreachable", { error: (err as Error).message, providerJobId });
      return { status: "processing", videoUrl: null, thumbnailUrl: null, aspectRatio: null, duration: null, progressPercent: 25 };
    }
    throw err;
  }
  const text = await res.text().catch(() => "");
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    logError("local video poll failed", { status: res.status, body: text.slice(0, 500), providerJobId });
    if (res.status >= 500 || res.status === 429) {
      return { status: "processing", videoUrl: null, thumbnailUrl: null, aspectRatio: null, duration: null, progressPercent: 25 };
    }
    return {
      status: "failed",
      videoUrl: null,
      thumbnailUrl: null,
      aspectRatio: null,
      duration: null,
      reason: `Local video router ${res.status}: ${text.slice(0, 300) || "unknown error"}`,
      progressPercent: null,
    };
  }

  const status = normalizeLocalStatus(payload);
  const payloadRecord = localVideoRecord(payload);
  const progress = localVideoNumber(payloadRecord.progress) ?? localVideoNumber(payloadRecord.progress_percent);
  const videoUrl = extractLocalVideoUrl(payload);
  if (status === "completed" && !videoUrl) {
    return {
      status: "failed",
      videoUrl: null,
      thumbnailUrl: null,
      aspectRatio: null,
      duration: null,
      reason: "Local video router completed without a video URL",
      progressPercent: null,
    };
  }

  return {
    status,
    videoUrl,
    thumbnailUrl: extractLocalThumbnailUrl(payload),
    aspectRatio: localVideoText(payloadRecord.aspect_ratio) ?? localVideoText(payloadRecord.aspectRatio),
    duration: localVideoNumber(payloadRecord.duration) ?? localVideoNumber(payloadRecord.duration_seconds),
    reason: status === "failed" ? (localVideoText(payloadRecord.error) ?? localVideoText(payloadRecord.reason)) : null,
    progressPercent: status === "completed" ? 100 : progress,
  };
}

async function startGeneration(
  providerKey: ProviderKey,
  resolvedModel: string,
  input: GenerationStartInput,
): Promise<GenerationStartResult> {
  const apiKey = getProviderApiKey(providerKey);

  // Make reference-image continuity behavior explicit and observable.
  if (input.referenceImageUrls && input.referenceImageUrls.length > 0) {
    logInfo("reference-image continuity", {
      providerKey,
      resolvedModel,
      referenceCount: input.referenceImageUrls.length,
      startImage: supportsStartImage(providerKey, resolvedModel),
      dedicatedReferenceSupport: supportsReferenceImages(providerKey, resolvedModel),
    });
  }


  if (providerKey === "local") {
    return await startLocalVideo(resolvedModel, input);
  }

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

  if (providerKey === "local") {
    return await pollLocalVideo(providerJobId);
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
  localVideoStatus,
};
