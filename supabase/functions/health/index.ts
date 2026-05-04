// Edge surface for admin-monitor.getHealth (v1).
// Thin adapter: all logic lives in the admin-monitor domain gateway.
import { preflightResponse } from "../_shared/core/http.ts";
import { adminMonitorGateway } from "../_shared/modules/admin-monitor/gateway.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return preflightResponse(req);
  return adminMonitorGateway.handle(req, "getHealth");
});
