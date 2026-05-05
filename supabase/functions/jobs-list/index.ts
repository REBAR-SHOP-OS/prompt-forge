// Edge surface for job-orchestrator.listMyJobs (v1).
import { corsHeaders } from "../_shared/core/http.ts";
import { jobOrchestratorGateway } from "../_shared/modules/job-orchestrator/gateway.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return jobOrchestratorGateway.handle(req, "listMyJobs");
});
