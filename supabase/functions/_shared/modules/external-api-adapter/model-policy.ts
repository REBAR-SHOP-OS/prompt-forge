import type { ProviderKey } from "./contract.ts";

interface ModelCost {
  perSecondUsd?: number;
  flatUsd?: number;
}

export const CLOUD_MODEL_COSTS_USD: Readonly<Record<string, ModelCost>> = Object.freeze({
  "veo-3.1-fast-generate-preview": { perSecondUsd: 0.10 },
  "veo-3.1-generate-preview": { perSecondUsd: 0.40 },
  "veo-3.1-lite-generate-preview": { perSecondUsd: 0.10 },
  "wan-video-1": { flatUsd: 0.15 },
  "wan2.7-i2v-2026-04-25": { flatUsd: 0.15 },
  "wan2.7-t2v-2026-04-25": { flatUsd: 0.15 },
});

const FLOW_MODELS = new Set([
  "veo-3.1-fast-generate-preview",
  "veo-3.1-generate-preview",
  "veo-3.1-lite-generate-preview",
]);
const WAN_MODELS = new Set([
  "wan-video-1",
  "wan2.7-i2v-2026-04-25",
  "wan2.7-t2v-2026-04-25",
]);

export function assertSupportedCloudModel(providerKey: ProviderKey, resolvedModel: string): void {
  const allowed = providerKey === "flow" ? FLOW_MODELS : providerKey === "wan" ? WAN_MODELS : null;
  if (!allowed || !allowed.has(resolvedModel) || !CLOUD_MODEL_COSTS_USD[resolvedModel]) {
    throw new Error(`unsupported ${providerKey} video model: ${resolvedModel}`);
  }
}

/** Compute USD cost and fail closed if a cloud model has no explicit price. */
export function computeUsd(resolvedModel: string, durationSeconds: number): number {
  const cfg = CLOUD_MODEL_COSTS_USD[resolvedModel];
  if (!cfg) throw new Error(`missing price for video model: ${resolvedModel}`);
  if (cfg.flatUsd !== undefined) return cfg.flatUsd;
  if (cfg.perSecondUsd !== undefined) {
    const calls = durationSeconds > 8 ? 2 : 1;
    const billed = calls === 2 ? 16 : Math.min(8, durationSeconds);
    return +(cfg.perSecondUsd * billed).toFixed(4);
  }
  throw new Error(`invalid price configuration for video model: ${resolvedModel}`);
}
