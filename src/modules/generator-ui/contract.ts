// Generator UI — contract.
import type { RoutePreviewInput, RoutePreviewResult } from "@/modules/external-api-adapter/contract";

export interface GeneratorUiApi {
  routePreview(input: RoutePreviewInput): Promise<RoutePreviewResult>;
}
