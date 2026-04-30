// shared-core edge surface: who am I (profile + role).
import { corsHeaders, errorResponse, jsonResponse, startRequest } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient, getUserScopedClient } from "../_shared/core/supabase.ts";
import { logError, writeApiRequestLog } from "../_shared/core/observability.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ctx = startRequest(req, "/me");
  const svc = getServiceClient();

  try {
    const auth = await authenticate(req);
    if (!auth) {
      await writeApiRequestLog(svc, { ...ctx, statusCode: 401, latencyMs: Date.now() - ctx.startedAt, errorCode: "UNAUTHORIZED" });
      return errorResponse("UNAUTHORIZED", "Missing or invalid token", 401, ctx.requestId);
    }

    const userClient = getUserScopedClient(auth.authHeader);

    const [{ data: profile, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      userClient.from("core_user_profiles").select("id, email, credits_balance, created_at").eq("id", auth.userId).maybeSingle(),
      userClient.from("user_roles").select("role").eq("user_id", auth.userId),
    ]);

    if (pErr || rErr) {
      logError("me lookup failed", { pErr: pErr?.message, rErr: rErr?.message });
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
  } catch (e) {
    logError("me unhandled", { error: (e as Error).message });
    await writeApiRequestLog(svc, { ...ctx, statusCode: 500, latencyMs: Date.now() - ctx.startedAt, errorCode: "INTERNAL" });
    return errorResponse("INTERNAL", "Internal error", 500, ctx.requestId);
  }
});
