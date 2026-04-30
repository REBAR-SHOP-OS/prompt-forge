// admin-monitor edge surface: service health.
import { corsHeaders, jsonResponse } from "../_shared/core/http.ts";
import { adminMonitor } from "../_shared/modules/admin-monitor/service.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return jsonResponse(adminMonitor.getHealth());
});
