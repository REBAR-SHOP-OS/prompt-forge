// Backwards-compatible shim. New code should import from
// ./modules/external-api-adapter/contract + service.
import { aiGateway } from "./modules/external-api-adapter/service.ts";
export type { ProviderKey, ResolvedRoute } from "./modules/external-api-adapter/contract.ts";

export const sanitizePrompt = aiGateway.sanitizePrompt;
export const getProviderApiKey = aiGateway.getProviderApiKey;
export const resolveRoute = aiGateway.resolveRoute;
