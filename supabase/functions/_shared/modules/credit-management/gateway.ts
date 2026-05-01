// Credit-Management — domain gateway (single public ingress for this domain).
//
// Public contract (v1):
//   - getMyBalance(): { credits_balance } — auth required; RLS-enforced read.

import { errorResponse, jsonResponse, startRequest } from "../../core/http.ts";
import { authenticate } from "../../core/auth.ts";
import { getServiceClient, getUserScopedClient } from "../../core/supabase.ts";
import { logError, writeApiRequestLog } from "../../core/observability.ts";
import { creditService } from "./service.ts";
import type { DomainContractMeta } from "../_gateway/types.ts";

export const CREDIT_MANAGEMENT_CONTRACT: DomainContractMeta = {
  domain: "credit-management",
  version: "v1",
  operations: ["getMyBalance"],
} as const;

export const creditManagementGateway = {
  contract: CREDIT_MANAGEMENT_CONTRACT,

  async handle(req: Request, operation: string): Promise<Response> {
    const ctx = startRequest(req, `/${CREDIT_MANAGEMENT_CONTRACT.domain}/${operation}`);
    const svc = getServiceClient();
    try {
      const auth = await authenticate(req);
      if (!auth) {
        await writeApiRequestLog(svc, { ...ctx, statusCode: 401, latencyMs: Date.now() - ctx.startedAt, errorCode: "UNAUTHORIZED" });
        return errorResponse("UNAUTHORIZED", "Missing or invalid token", 401, ctx.requestId);
      }

      switch (operation) {
        case "getMyBalance": {
          const userClient = getUserScopedClient(auth.authHeader);
          const balance = await creditService.getBalance(auth.userId, userClient);
          if (balance === null) {
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 404, latencyMs: Date.now() - ctx.startedAt, errorCode: "PROFILE_NOT_FOUND" });
            return errorResponse("PROFILE_NOT_FOUND", "Profile not found", 404, ctx.requestId);
          }
          await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt });
          return jsonResponse({ credits_balance: balance, requestId: ctx.requestId });
        }
        default:
          await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 404, latencyMs: Date.now() - ctx.startedAt, errorCode: "UNKNOWN_OPERATION" });
          return errorResponse("UNKNOWN_OPERATION", `Unknown operation: ${operation}`, 404, ctx.requestId);
      }
    } catch (e) {
      logError("credit-management gateway unhandled", { error: (e as Error).message, operation });
      await writeApiRequestLog(svc, { ...ctx, statusCode: 500, latencyMs: Date.now() - ctx.startedAt, errorCode: "INTERNAL" });
      return errorResponse("INTERNAL", "Internal error", 500, ctx.requestId);
    }
  },
};
