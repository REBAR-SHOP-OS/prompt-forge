// AI Gateway: provider/model resolution and cost estimation.
// Provider secrets are read from env only, never returned to clients.
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type ProviderKey = "flow" | "wan";

interface ModelCostConfig {
  // Cost per 1k prompt characters (proxy unit for preview-stage estimation).
  costPer1kChars: number;
}

// Configurable cost map. Real per-token/per-second pricing comes in a later phase.
const COST_MAP: Record<string, ModelCostConfig> = {
  "flow-video-1": { costPer1kChars: 0.04 },
  "wan-video-1": { costPer1kChars: 0.03 },
};

export interface ResolvedRoute {
  providerKey: ProviderKey;
  resolvedModel: string;
  estimatedCost: number;
}

export function sanitizePrompt(p: string): string {
  return p.replace(/\s+/g, " ").trim();
}

export function getProviderApiKey(providerKey: ProviderKey): string | null {
  if (providerKey === "flow") return Deno.env.get("FLOW_API_KEY") ?? null;
  if (providerKey === "wan") return Deno.env.get("WAN_API_KEY") ?? null;
  return null;
}

export async function resolveRoute(
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
