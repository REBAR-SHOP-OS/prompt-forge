// External API Adapter — frontend-side shared types (mirror of backend contract).
export type ProviderKey = "flow" | "wan";

export interface RoutePreviewInput {
  providerKey: ProviderKey;
  requestedModel?: string;
  prompt: string;
}

export interface RoutePreviewResult {
  providerKey: string;
  resolvedModel: string;
  estimatedCost: number;
  requestId: string;
}
