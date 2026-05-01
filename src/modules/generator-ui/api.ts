// Deprecated: prefer `generatorUiGateway` from "./gateway".
import { generatorUiGateway } from "./gateway";
import type { GeneratorUiApi } from "./contract";

export const generatorUiApi: GeneratorUiApi = {
  routePreview: (input) => generatorUiGateway.routePreview(input),
};
