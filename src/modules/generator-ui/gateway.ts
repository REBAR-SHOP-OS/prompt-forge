// Generator-UI — frontend gateway (single grouped client for this domain).
//
// Public contract (v1):
//   - getMe() -> Me           (session bootstrap; backed by edge fn `me`)
//   - routePreview(input)     (delegates to external-api-adapter gateway —
//                              kept here as a convenience facade for the
//                              Generator UI screens; cross-domain call goes
//                              through the adapter's public contract.)
import { request } from "@/core/api/client";
import type { Me } from "@/core/api/types";
import { externalApiAdapterGateway } from "@/modules/external-api-adapter/gateway";
import type { RoutePreviewInput, RoutePreviewResult } from "@/modules/external-api-adapter/contract";

export const GENERATOR_UI_CONTRACT_VERSION = "v1" as const;

export const generatorUiGateway = {
  contractVersion: GENERATOR_UI_CONTRACT_VERSION,
  getMe: () => request<Me>("/me"),
  routePreview: (input: RoutePreviewInput): Promise<RoutePreviewResult> =>
    externalApiAdapterGateway.routePreview(input),
};
