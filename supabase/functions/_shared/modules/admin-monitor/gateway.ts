// Admin-Monitor — domain gateway (single public ingress for this domain).
//
// Public contract (v1):
//   - getHealth(): HealthSummary   — unauthenticated; safe public probe.
//
// All admin-monitor edge functions MUST call adminMonitorGateway.handle().
// Direct imports of ./service from outside this folder are deprecated.

import { errorResponse, jsonResponse, startRequest } from "../../core/http.ts";
import { logError, writeApiRequestLog } from "../../core/observability.ts";
import { getServiceClient } from "../../core/supabase.ts";
import { adminMonitor } from "./service.ts";
import type { DomainContractMeta, GatewayRequest, GatewayResponse } from "../_gateway/types.ts";

export const ADMIN_MONITOR_CONTRACT: DomainContractMeta = {
  domain: "admin-monitor",
  version: "v1",
  operations: ["getHealth"],
} as const;

async function dispatch(input: GatewayRequest): Promise<GatewayResponse> {
  switch (input.operation) {
    case "getHealth":
      return { status: 200, body: adminMonitor.getHealth() };
    default:
      return {
        status: 404,
        body: { error: { code: "UNKNOWN_OPERATION", message: `Unknown operation: ${input.operation}` } },
      };
  }
}

export const adminMonitorGateway = {
  contract: ADMIN_MONITOR_CONTRACT,

  /** Edge entry point: handle a Request end-to-end and return a Response. */
  async handle(req: Request, operation: string): Promise<Response> {
    const ctx = startRequest(req, `/${ADMIN_MONITOR_CONTRACT.domain}/${operation}`);
    const svc = getServiceClient();
    try {
      const out = await dispatch({ req, operation });
      await writeApiRequestLog(svc, {
        ...ctx,
        statusCode: out.status,
        latencyMs: Date.now() - ctx.startedAt,
        errorCode: out.status >= 400 ? "GATEWAY_ERROR" : null,
      });
      if (out.status >= 400) {
        const body = out.body as { error?: { code: string; message: string } };
        return errorResponse(body.error?.code ?? "ERROR", body.error?.message ?? "Error", out.status, ctx.requestId);
      }
      return jsonResponse({ ...(out.body as object), requestId: ctx.requestId }, out.status);
    } catch (e) {
      logError("admin-monitor gateway unhandled", { error: (e as Error).message, operation });
      await writeApiRequestLog(svc, { ...ctx, statusCode: 500, latencyMs: Date.now() - ctx.startedAt, errorCode: "INTERNAL" });
      return errorResponse("INTERNAL", "Internal error", 500, ctx.requestId);
    }
  },
};
