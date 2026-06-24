// External API Adapter — contract.
import type { SupabaseClient } from "../../core/supabase.ts";

export type ProviderKey = "flow" | "wan" | "local";

export interface ResolvedRoute {
  providerKey: ProviderKey;
  resolvedModel: string;
  estimatedCost: number;
}

export interface GenerationStartInput {
  prompt: string;
  /** First-frame image URL (publicly fetchable by the provider). */
  firstFrameUrl?: string | null;
  /** Last-frame image URL (publicly fetchable by the provider). */
  lastFrameUrl?: string | null;
  /**
   * Optional persistent character/reference image URL(s). Forwarded to providers
   * that support reference-guided generation (Veo 3.1); ignored otherwise.
   */
  referenceImageUrls?: string[] | null;
  /** Requested clip length in seconds (5, 10, or 15). Defaults to 5. */
  durationSeconds?: 5 | 10 | 15 | null;
  /** Requested output aspect ratio. Defaults to 16:9. */
  aspectRatio?: "9:16" | "1:1" | "16:9" | null;
}

export interface GenerationStartResult {
  providerJobId: string;
  /** Final asset URL when synchronous. Null for async providers. */
  videoUrl: string | null;
  thumbnailUrl: string | null;
  aspectRatio: string | null;
  duration: number | null;
  /** Whether the generation completed during this call. */
  isComplete: boolean;
}

export type PollStatus = "pending" | "processing" | "completed" | "failed";

export interface GenerationPollResult {
  status: PollStatus;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  aspectRatio: string | null;
  duration: number | null;
  /** Provider error reason when status === "failed". */
  reason?: string | null;
  /** 0-100 progress estimate (provider-real if available, else time-based). */
  progressPercent?: number | null;
  /**
   * Updated provider job id, when the adapter needs to evolve durable state
   * across polls (e.g. Veo phase 1 → extension operation handoff).
   * The orchestrator should persist this to the job row before returning.
   */
  providerJobId?: string | null;
}

/** Optional context that lets resolveRoute pick the right Veo tier and compute
 *  a duration-accurate cost preview. Safe to omit — callers without context
 *  get a default short-clip preview. */
export interface ResolveRouteOptions {
  /** Generation duration in seconds (5/10/15). Defaults to 5. */
  durationSeconds?: number | null;
  /** When true, the request includes a last-frame and must use a model that
   *  supports first+last frame interpolation (Veo 3.1, not Veo Fast). */
  hasLastFrame?: boolean;
  /** When true, the request carries persistent reference (Character Sheet)
   *  images and must use the reference-capable model (Veo 3.1, not Veo Fast). */
  hasReferenceImages?: boolean;
}

export interface AiGateway {
  resolveRoute(
    client: SupabaseClient,
    providerKey: ProviderKey,
    requestedModel: string | undefined,
    prompt: string,
    opts?: ResolveRouteOptions,
  ): Promise<ResolvedRoute>;
  sanitizePrompt(p: string): string;
  /**
   * No-secret config/health status for the local video router. `probe=true`
   * attempts a reachability check against the configured router.
   */
  localVideoStatus(
    probe?: boolean,
  ): Promise<{
    status: "configured" | "not_configured" | "unreachable";
    message: string;
    configured: boolean;
    reachable: boolean | null;
    create_endpoint_found: boolean | null;
    attempted_create_paths: string[];
    router_type: "openai_compatible" | "comfyui" | null;
  }>;
  getProviderApiKey(p: ProviderKey): string | null;
  /**
   * Trigger a generation against the external provider.
   * Wan (DashScope) is async: returns providerJobId, isComplete=false.
   */
  startGeneration(
    providerKey: ProviderKey,
    resolvedModel: string,
    input: GenerationStartInput,
  ): Promise<GenerationStartResult>;
  /**
   * Poll an in-flight generation by providerJobId. Used by the orchestrator
   * to surface terminal states without coupling to provider-specific logic.
   */
  pollGeneration(
    providerKey: ProviderKey,
    providerJobId: string,
    ctx?: { client: SupabaseClient; userId: string },
  ): Promise<GenerationPollResult>;
}
