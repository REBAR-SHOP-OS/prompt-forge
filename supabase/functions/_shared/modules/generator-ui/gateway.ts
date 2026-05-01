// Generator-UI — domain gateway (single public ingress for this domain).
//
// Public contract (v1):
//   - getMe() -> MeProfile        (auth required; RLS-enforced read)
//
// Note: routePreview is owned by external-api-adapter; the dashboard reaches
// it via that domain's gateway, not through this one.

import { errorResponse, jsonResponse, startRequest } from "../../core/http.ts";
import { authenticate } from "../../core/auth.ts";
import { getServiceClient, getUserScopedClient } from "../../core/supabase.ts";
import { logError, writeApiRequestLog } from "../../core/observability.ts";
import type { DomainContractMeta } from "../_gateway/types.ts";

export const GENERATOR_UI_CONTRACT: DomainContractMeta = {
  domain: "generator-ui",
  version: "v1",
  operations: ["getMe"],
} as const;

export const generatorUiGateway = {
  contract: GENERATOR_UI_CONTRACT,

  async handle(req: Request, operation: string): Promise<Response> {
    const ctx = startRequest(req, `/${GENERATOR_UI_CONTRACT.domain}/${operation}`);
    const svc = getServiceClient();
    try {
      const auth = await authenticate(req);
      if (!auth) {
        await writeApiRequestLog(svc, { ...ctx, statusCode: 401, latencyMs: Date.now() - ctx.startedAt, errorCode: "UNAUTHORIZED" });
        return errorResponse("UNAUTHORIZED", "Missing or invalid token", 401, ctx.requestId);
      }

      switch (operation) {
        case "getMe": {
          const userClient = getUserScopedClient(auth.authHeader);
          const [{ data: profile, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
            userClient.from("core_user_profiles").select("id, email, credits_balance, created_at").eq("id", auth.userId).maybeSingle(),
            userClient.from("user_roles").select("role").eq("user_id", auth.userId),
          ]);
          if (pErr || rErr) {
            logError("generator-ui getMe lookup failed", { pErr: pErr?.message, rErr: rErr?.message });
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 500, latencyMs: Date.now() - ctx.startedAt, errorCode: "DB_ERROR" });
            return errorResponse("DB_ERROR", "Could not load profile", 500, ctx.requestId);
          }
          if (!profile) {
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 404, latencyMs: Date.now() - ctx.startedAt, errorCode: "PROFILE_NOT_FOUND" });
            return errorResponse("PROFILE_NOT_FOUND", "Profile not found", 404, ctx.requestId);
          }
          const role = roles?.some((r) => r.role === "admin") ? "admin" : "user";
          await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt });
          return jsonResponse({
            id: profile.id,
            email: profile.email,
            role,
            credits_balance: profile.credits_balance,
            created_at: profile.created_at,
            requestId: ctx.requestId,
          });
        }
        default:
          await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 404, latencyMs: Date.now() - ctx.startedAt, errorCode: "UNKNOWN_OPERATION" });
          return errorResponse("UNKNOWN_OPERATION", `Unknown operation: ${operation}`, 404, ctx.requestId);
      }
    } catch (e) {
      logError("generator-ui gateway unhandled", { error: (e as Error).message, operation });
      await writeApiRequestLog(svc, { ...ctx, statusCode: 500, latencyMs: Date.now() - ctx.startedAt, errorCode: "INTERNAL" });
      return errorResponse("INTERNAL", "Internal error", 500, ctx.requestId);
    }
  },
};
