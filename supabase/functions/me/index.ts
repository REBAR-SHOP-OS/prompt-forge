import {
  authenticate, corsHeaders, errorResponse, getServiceClient, getUserScopedClient,
  jsonResponse, logError, newRequestId, writeApiRequestLog,
} from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestId = req.headers.get("x-request-id") ?? newRequestId();
  const start = Date.now();
  const route = "/me";
  const svc = getServiceClient();

  try {
    const auth = await authenticate(req);
    if (!auth) {
      const res = errorResponse("UNAUTHORIZED", "Missing or invalid token", 401, requestId);
      await writeApiRequestLog(svc, { requestId, route, method: req.method, statusCode: 401, latencyMs: Date.now()-start, errorCode: "UNAUTHORIZED" });
      return res;
    }

    const userClient = getUserScopedClient(auth.authHeader);

    const [{ data: profile, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      userClient.from("core_user_profiles").select("id, email, credits_balance, created_at").eq("id", auth.userId).maybeSingle(),
      userClient.from("user_roles").select("role").eq("user_id", auth.userId),
    ]);

    if (pErr || rErr) {
      logError("me lookup failed", { pErr: pErr?.message, rErr: rErr?.message });
      await writeApiRequestLog(svc, { requestId, userId: auth.userId, route, method: req.method, statusCode: 500, latencyMs: Date.now()-start, errorCode: "DB_ERROR" });
      return errorResponse("DB_ERROR", "Could not load profile", 500, requestId);
    }
    if (!profile) {
      await writeApiRequestLog(svc, { requestId, userId: auth.userId, route, method: req.method, statusCode: 404, latencyMs: Date.now()-start, errorCode: "PROFILE_NOT_FOUND" });
      return errorResponse("PROFILE_NOT_FOUND", "Profile not found", 404, requestId);
    }

    const role = roles?.some((r) => r.role === "admin") ? "admin" : "user";

    await writeApiRequestLog(svc, { requestId, userId: auth.userId, route, method: req.method, statusCode: 200, latencyMs: Date.now()-start });
    return jsonResponse({
      id: profile.id, email: profile.email, role,
      credits_balance: profile.credits_balance, created_at: profile.created_at,
      requestId,
    });
  } catch (e) {
    logError("me unhandled", { error: (e as Error).message });
    await writeApiRequestLog(svc, { requestId, route, method: req.method, statusCode: 500, latencyMs: Date.now()-start, errorCode: "INTERNAL" });
    return errorResponse("INTERNAL", "Internal error", 500, requestId);
  }
});
