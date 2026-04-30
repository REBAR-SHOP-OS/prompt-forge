import { z } from "https://esm.sh/zod@3.23.8";
import {
  authenticate, corsHeaders, errorResponse, getServiceClient, jsonResponse,
  logError, newRequestId, rateLimit, writeApiRequestLog, writeAuditLog,
} from "../_shared/utils.ts";
import { resolveRoute, sanitizePrompt, ProviderKey } from "../_shared/aiGateway.ts";

const BodySchema = z.object({
  providerKey: z.enum(["flow", "wan"]),
  requestedModel: z.string().trim().min(1).max(100).optional(),
  prompt: z.string().min(1).max(4000),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405);

  const requestId = req.headers.get("x-request-id") ?? newRequestId();
  const start = Date.now();
  const route = "/internal/ai-gateway/route-preview";
  const svc = getServiceClient();

  try {
    const auth = await authenticate(req);
    if (!auth) {
      await writeApiRequestLog(svc, { requestId, route, method: req.method, statusCode: 401, latencyMs: Date.now()-start, errorCode: "UNAUTHORIZED" });
      return errorResponse("UNAUTHORIZED", "Missing or invalid token", 401, requestId);
    }

    // Rate limit: 30 req / min per user
    if (!rateLimit(`route-preview:${auth.userId}`, 30, 60_000)) {
      await writeApiRequestLog(svc, { requestId, userId: auth.userId, route, method: req.method, statusCode: 429, latencyMs: Date.now()-start, errorCode: "RATE_LIMITED" });
      return errorResponse("RATE_LIMITED", "Too many requests", 429, requestId);
    }

    let body: unknown;
    try { body = await req.json(); } catch {
      await writeApiRequestLog(svc, { requestId, userId: auth.userId, route, method: req.method, statusCode: 400, latencyMs: Date.now()-start, errorCode: "INVALID_JSON" });
      return errorResponse("INVALID_JSON", "Invalid JSON body", 400, requestId);
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      await writeApiRequestLog(svc, { requestId, userId: auth.userId, route, method: req.method, statusCode: 400, latencyMs: Date.now()-start, errorCode: "VALIDATION_ERROR" });
      return jsonResponse({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, requestId }, 400);
    }

    const prompt = sanitizePrompt(parsed.data.prompt);
    const providerKey = parsed.data.providerKey as ProviderKey;

    const resolved = await resolveRoute(svc, providerKey, parsed.data.requestedModel, prompt);

    await writeApiRequestLog(svc, {
      requestId, userId: auth.userId, route, method: req.method,
      statusCode: 200, latencyMs: Date.now()-start,
      providerKey: resolved.providerKey, modelKey: resolved.resolvedModel,
      estimatedCost: resolved.estimatedCost,
    });

    await writeAuditLog(svc, {
      actorUserId: auth.userId,
      action: "ai_gateway.route_preview",
      targetType: "ai_provider",
      targetId: resolved.providerKey,
      requestId,
      metadata: { resolvedModel: resolved.resolvedModel, estimatedCost: resolved.estimatedCost, promptLength: prompt.length },
    });

    return jsonResponse({
      providerKey: resolved.providerKey,
      resolvedModel: resolved.resolvedModel,
      estimatedCost: resolved.estimatedCost,
      requestId,
    });
  } catch (e) {
    logError("route-preview unhandled", { error: (e as Error).message });
    await writeApiRequestLog(svc, { requestId, route, method: req.method, statusCode: 500, latencyMs: Date.now()-start, errorCode: "INTERNAL" });
    return errorResponse("INTERNAL", "Internal error", 500, requestId);
  }
});
