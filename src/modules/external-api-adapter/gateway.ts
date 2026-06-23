// External-API-Adapter — frontend gateway (single grouped client for this domain).
//
// Public contract (v1):
//   - routePreview({ providerKey, requestedModel?, prompt }) -> RoutePreviewResult
import { request } from "@/core/api/client";
import type { RoutePreviewInput, RoutePreviewResult } from "./contract";

export const EXTERNAL_API_ADAPTER_CONTRACT_VERSION = "v1" as const;

export interface LocalVideoStatusResult {
  status: "configured" | "not_configured" | "unreachable";
  message: string;
}

export const externalApiAdapterGateway = {
  contractVersion: EXTERNAL_API_ADAPTER_CONTRACT_VERSION,
  routePreview: (input: RoutePreviewInput) =>
    request<RoutePreviewResult>("/ai-gateway-route-preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Local video router config/health. Pass probe=true for a reachability check. */
  localVideoStatus: (probe = false) =>
    request<LocalVideoStatusResult>(`/local-video-status${probe ? "?probe=true" : ""}`, {
      method: "GET",
    }),
};
