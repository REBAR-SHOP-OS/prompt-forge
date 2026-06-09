// External API Adapter — frontend-side shared types (mirror of backend contract).
export type ProviderKey = "flow" | "wan" | "local";

export interface RoutePreviewInput {
  providerKey: ProviderKey;
  requestedModel?: string;
  prompt: string;
}

export interface RoutePreviewResult {
  providerKey: string;
  resolvedModel: string;
  estimatedCost: number;
  /** Whether the local RTX video router is configured server-side. */
  localConfigured?: boolean;
  requestId: string;
}
