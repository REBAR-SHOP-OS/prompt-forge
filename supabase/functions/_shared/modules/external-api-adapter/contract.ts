// External API Adapter — contract.
import type { SupabaseClient } from "../../core/supabase.ts";

export type ProviderKey = "flow" | "wan";

export interface ResolvedRoute {
  providerKey: ProviderKey;
  resolvedModel: string;
  estimatedCost: number;
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
}
