// External API Adapter — contract.
import type { SupabaseClient } from "../../core/supabase.ts";

export type ProviderKey = "flow" | "wan";

export interface ResolvedRoute {
  providerKey: ProviderKey;
  resolvedModel: string;
  estimatedCost: number;
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
   * Trigger a generation against the external provider. In Phase 5 the call is
   * mocked deterministically when no provider key is configured; the public
   * contract is identical to a real provider call so the adapter can be swapped
   * later without touching the orchestrator.
   */
  startGeneration(
    providerKey: ProviderKey,
    resolvedModel: string,
    prompt: string,
  ): Promise<GenerationStartResult>;
}
