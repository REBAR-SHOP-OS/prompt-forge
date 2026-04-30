// Generator UI — API impl. Wraps the cross-domain external-api-adapter call.
import { request } from "@/core/api/client";
import type { GeneratorUiApi } from "./contract";
import type { RoutePreviewInput, RoutePreviewResult } from "@/modules/external-api-adapter/contract";

export const generatorUiApi: GeneratorUiApi = {
  routePreview: (input: RoutePreviewInput) =>
    request<RoutePreviewResult>("/ai-gateway-route-preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
