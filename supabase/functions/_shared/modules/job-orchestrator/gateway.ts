// Job-Orchestrator — domain gateway (single public ingress for this domain).
//
// Public contract (v1, read-only in Phase 3):
//   - listMyJobs() -> JobSummary[]
//
// No edge endpoint is wired yet (ships with Phase 4); the gateway exists so
// any future ingress goes through this one place.

import { errorResponse, jsonResponse, startRequest } from "../../core/http.ts";
import { authenticate } from "../../core/auth.ts";
import { getServiceClient, getUserScopedClient } from "../../core/supabase.ts";
import { logError, writeApiRequestLog } from "../../core/observability.ts";
import { jobService } from "./service.ts";
import type { DomainContractMeta } from "../_gateway/types.ts";

export const JOB_ORCHESTRATOR_CONTRACT: DomainContractMeta = {
  domain: "job-orchestrator",
  version: "v1",
  operations: ["listMyJobs"],
} as const;

export const jobOrchestratorGateway = {
  contract: JOB_ORCHESTRATOR_CONTRACT,

  async handle(req: Request, operation: string): Promise<Response> {
    const ctx = startRequest(req, `/${JOB_ORCHESTRATOR_CONTRACT.domain}/${operation}`);
    const svc = getServiceClient();
    try {
      const auth = await authenticate(req);
      if (!auth) {
        await writeApiRequestLog(svc, { ...ctx, statusCode: 401, latencyMs: Date.now() - ctx.startedAt, errorCode: "UNAUTHORIZED" });
        return errorResponse("UNAUTHORIZED", "Missing or invalid token", 401, ctx.requestId);
      }
      switch (operation) {
        case "listMyJobs": {
          const userClient = getUserScopedClient(auth.authHeader);
          const items = await jobService.listMyJobs(auth.userId, userClient);
          await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt });
          return jsonResponse({ items, requestId: ctx.requestId });
        }
        default:
          return errorResponse("UNKNOWN_OPERATION", `Unknown operation: ${operation}`, 404, ctx.requestId);
      }
    } catch (e) {
      logError("job-orchestrator gateway unhandled", { error: (e as Error).message, operation });
      await writeApiRequestLog(svc, { ...ctx, statusCode: 500, latencyMs: Date.now() - ctx.startedAt, errorCode: "INTERNAL" });
      return errorResponse("INTERNAL", "Internal error", 500, ctx.requestId);
    }
  },
};
