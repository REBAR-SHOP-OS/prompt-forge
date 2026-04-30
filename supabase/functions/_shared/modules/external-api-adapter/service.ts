// External API Adapter — service implementation.
// Provider/model resolution + cost estimation. Provider keys read from env only.
import type { SupabaseClient } from "../../core/supabase.ts";
import type { AiGateway, ProviderKey, ResolvedRoute } from "./contract.ts";

interface ModelCostConfig {
  // Cost per 1k prompt characters (proxy unit for preview-stage estimation).
  costPer1kChars: number;
}

const COST_MAP: Record<string, ModelCostConfig> = {
  "flow-video-1": { costPer1kChars: 0.04 },
  "wan-video-1": { costPer1kChars: 0.03 },
};

function sanitizePrompt(p: string): string {
  return p.replace(/\s+/g, " ").trim();
}

function getProviderApiKey(providerKey: ProviderKey): string | null {
  if (providerKey === "flow") return Deno.env.get("FLOW_API_KEY") ?? null;
  if (providerKey === "wan") return Deno.env.get("WAN_API_KEY") ?? null;
  return null;
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

export const aiGateway: AiGateway = {
  resolveRoute,
  sanitizePrompt,
  getProviderApiKey,
};
