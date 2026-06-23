// Edge surface for external-api-adapter.localVideoStatus (v1).
// Returns the local video router config/health status: configured |
// not_configured | unreachable. No secrets or URLs are leaked.
import { corsHeaders } from "../_shared/core/http.ts";
import { externalApiAdapterGateway } from "../_shared/modules/external-api-adapter/gateway.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return externalApiAdapterGateway.handle(req, "localVideoStatus");
});
