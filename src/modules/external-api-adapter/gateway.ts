// External-API-Adapter — frontend gateway (single grouped client for this domain).
//
// Public contract (v1):
//   - routePreview({ providerKey, requestedModel?, prompt }) -> RoutePreviewResult
import { request } from "@/core/api/client";
import type { RoutePreviewInput, RoutePreviewResult } from "./contract";

export const EXTERNAL_API_ADAPTER_CONTRACT_VERSION = "v1" as const;

export const externalApiAdapterGateway = {
  contractVersion: EXTERNAL_API_ADAPTER_CONTRACT_VERSION,
  routePreview: (input: RoutePreviewInput) =>
    request<RoutePreviewResult>("/ai-gateway-route-preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
