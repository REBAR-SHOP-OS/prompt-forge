// external-api-adapter edge surface: provider/model resolution + cost preview.
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders, errorResponse, jsonResponse, startRequest } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";
import { logError, writeApiRequestLog } from "../_shared/core/observability.ts";
import { writeAuditLog } from "../_shared/core/audit.ts";
import { rateLimit } from "../_shared/core/ratelimit.ts";
import { aiGateway } from "../_shared/modules/external-api-adapter/service.ts";
import type { ProviderKey } from "../_shared/modules/external-api-adapter/contract.ts";

const BodySchema = z.object({
  providerKey: z.enum(["flow", "wan"]),
  requestedModel: z.string().trim().min(1).max(100).optional(),
  prompt: z.string().min(1).max(4000),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405);

  const ctx = startRequest(req, "/internal/ai-gateway/route-preview");
  const svc = getServiceClient();

  try {
    const auth = await authenticate(req);
    if (!auth) {
      await writeApiRequestLog(svc, { ...ctx, statusCode: 401, latencyMs: Date.now() - ctx.startedAt, errorCode: "UNAUTHORIZED" });
      return errorResponse("UNAUTHORIZED", "Missing or invalid token", 401, ctx.requestId);
    }

    if (!rateLimit(`route-preview:${auth.userId}`, 30, 60_000)) {
      await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 429, latencyMs: Date.now() - ctx.startedAt, errorCode: "RATE_LIMITED" });
      return errorResponse("RATE_LIMITED", "Too many requests", 429, ctx.requestId);
    }

    let body: unknown;
    try { body = await req.json(); } catch {
      await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 400, latencyMs: Date.now() - ctx.startedAt, errorCode: "INVALID_JSON" });
      return errorResponse("INVALID_JSON", "Invalid JSON body", 400, ctx.requestId);
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 400, latencyMs: Date.now() - ctx.startedAt, errorCode: "VALIDATION_ERROR" });
      return jsonResponse({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, requestId: ctx.requestId }, 400);
    }

    const prompt = aiGateway.sanitizePrompt(parsed.data.prompt);
    const providerKey = parsed.data.providerKey as ProviderKey;
    const resolved = await aiGateway.resolveRoute(svc, providerKey, parsed.data.requestedModel, prompt);

    await writeApiRequestLog(svc, {
      ...ctx,
      userId: auth.userId,
      statusCode: 200,
      latencyMs: Date.now() - ctx.startedAt,
      providerKey: resolved.providerKey,
      modelKey: resolved.resolvedModel,
      estimatedCost: resolved.estimatedCost,
    });

    await writeAuditLog(svc, {
      actorUserId: auth.userId,
      action: "ai_gateway.route_preview",
      targetType: "ai_provider",
      targetId: resolved.providerKey,
      requestId: ctx.requestId,
      metadata: { resolvedModel: resolved.resolvedModel, estimatedCost: resolved.estimatedCost, promptLength: prompt.length },
    });

    return jsonResponse({
      providerKey: resolved.providerKey,
      resolvedModel: resolved.resolvedModel,
      estimatedCost: resolved.estimatedCost,
      requestId: ctx.requestId,
    });
  } catch (e) {
    logError("route-preview unhandled", { error: (e as Error).message });
    await writeApiRequestLog(svc, { ...ctx, statusCode: 500, latencyMs: Date.now() - ctx.startedAt, errorCode: "INTERNAL" });
    return errorResponse("INTERNAL", "Internal error", 500, ctx.requestId);
  }
});
