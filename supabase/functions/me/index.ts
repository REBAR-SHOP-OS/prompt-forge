// Edge surface for generator-ui.getMe (v1).
// Thin adapter: all logic lives in the generator-ui domain gateway.
import { corsHeaders } from "../_shared/core/http.ts";
import { generatorUiGateway } from "../_shared/modules/generator-ui/gateway.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return generatorUiGateway.handle(req, "getMe");
});
