// External API Adapter — contract.
import type { SupabaseClient } from "../../core/supabase.ts";

export type ProviderKey = "flow" | "wan";

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
}

export interface AiGateway {
  resolveRoute(
    client: SupabaseClient,
    providerKey: ProviderKey,
    requestedModel: string | undefined,
    prompt: string,
  ): Promise<ResolvedRoute>;
  sanitizePrompt(p: string): string;
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
  ): Promise<GenerationPollResult>;
}
