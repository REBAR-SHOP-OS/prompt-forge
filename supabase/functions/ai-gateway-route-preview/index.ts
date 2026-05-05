// Edge surface for external-api-adapter.routePreview (v1).
// Thin adapter: all logic lives in the external-api-adapter domain gateway.
import { corsHeaders } from "../_shared/core/http.ts";
import { externalApiAdapterGateway } from "../_shared/modules/external-api-adapter/gateway.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return externalApiAdapterGateway.handle(req, "routePreview");
});
