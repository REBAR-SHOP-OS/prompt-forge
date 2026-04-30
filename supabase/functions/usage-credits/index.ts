import {
  authenticate, corsHeaders, errorResponse, getServiceClient, getUserScopedClient,
  jsonResponse, logError, newRequestId, writeApiRequestLog,
} from "../_shared/utils.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestId = req.headers.get("x-request-id") ?? newRequestId();
  const start = Date.now();
  const route = "/usage/credits";
  const svc = getServiceClient();

  try {
    const auth = await authenticate(req);
    if (!auth) {
      await writeApiRequestLog(svc, { requestId, route, method: req.method, statusCode: 401, latencyMs: Date.now()-start, errorCode: "UNAUTHORIZED" });
      return errorResponse("UNAUTHORIZED", "Missing or invalid token", 401, requestId);
    }

    const userClient = getUserScopedClient(auth.authHeader);
    const { data, error } = await userClient
      .from("core_user_profiles")
      .select("credits_balance")
      .eq("id", auth.userId)
      .maybeSingle();

    if (error || !data) {
      logError("credits lookup failed", { error: error?.message });
      await writeApiRequestLog(svc, { requestId, userId: auth.userId, route, method: req.method, statusCode: 500, latencyMs: Date.now()-start, errorCode: "DB_ERROR" });
      return errorResponse("DB_ERROR", "Could not load credits", 500, requestId);
    }

    await writeApiRequestLog(svc, { requestId, userId: auth.userId, route, method: req.method, statusCode: 200, latencyMs: Date.now()-start });
    return jsonResponse({ credits_balance: data.credits_balance, requestId });
  } catch (e) {
    logError("credits unhandled", { error: (e as Error).message });
    await writeApiRequestLog(svc, { requestId, route, method: req.method, statusCode: 500, latencyMs: Date.now()-start, errorCode: "INTERNAL" });
    return errorResponse("INTERNAL", "Internal error", 500, requestId);
  }
});
