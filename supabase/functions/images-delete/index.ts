// Edge surface for generator-ui.deleteUserImage (v1).
import { corsHeaders } from "../_shared/core/http.ts";
import { generatorUiGateway } from "../_shared/modules/generator-ui/gateway.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return generatorUiGateway.handle(req, "deleteUserImage");
});
