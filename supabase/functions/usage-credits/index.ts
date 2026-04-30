// credit-management edge surface: caller's balance.
import { corsHeaders, errorResponse, jsonResponse, startRequest } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient, getUserScopedClient } from "../_shared/core/supabase.ts";
import { logError, writeApiRequestLog } from "../_shared/core/observability.ts";
import { creditService } from "../_shared/modules/credit-management/service.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ctx = startRequest(req, "/usage/credits");
  const svc = getServiceClient();

  try {
    const auth = await authenticate(req);
    if (!auth) {
      await writeApiRequestLog(svc, { ...ctx, statusCode: 401, latencyMs: Date.now() - ctx.startedAt, errorCode: "UNAUTHORIZED" });
      return errorResponse("UNAUTHORIZED", "Missing or invalid token", 401, ctx.requestId);
    }

    const userClient = getUserScopedClient(auth.authHeader);
    const balance = await creditService.getBalance(auth.userId, userClient);
    if (balance === null) {
      await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 404, latencyMs: Date.now() - ctx.startedAt, errorCode: "PROFILE_NOT_FOUND" });
      return errorResponse("PROFILE_NOT_FOUND", "Profile not found", 404, ctx.requestId);
    }

    await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt });
    return jsonResponse({ credits_balance: balance, requestId: ctx.requestId });
  } catch (e) {
    logError("credits unhandled", { error: (e as Error).message });
    await writeApiRequestLog(svc, { ...ctx, statusCode: 500, latencyMs: Date.now() - ctx.startedAt, errorCode: "INTERNAL" });
    return errorResponse("INTERNAL", "Internal error", 500, ctx.requestId);
  }
});
