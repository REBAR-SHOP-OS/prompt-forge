// Edge surface for admin-monitor.getHealth (v1).
// Thin adapter: all logic lives in the admin-monitor domain gateway.
import { corsHeaders } from "../_shared/core/http.ts";
import { adminMonitorGateway } from "../_shared/modules/admin-monitor/gateway.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return adminMonitorGateway.handle(req, "getHealth");
});
