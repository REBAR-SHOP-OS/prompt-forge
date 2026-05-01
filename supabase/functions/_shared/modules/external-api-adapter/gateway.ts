// External-API-Adapter — domain gateway (single public ingress for this domain).
//
// Public contract (v1):
//   - routePreview({ providerKey, requestedModel?, prompt }) -> ResolvedRoute
//     auth required, rate limited, audit logged.

import { z } from "https://esm.sh/zod@3.23.8";
import { errorResponse, jsonResponse, startRequest } from "../../core/http.ts";
import { authenticate } from "../../core/auth.ts";
import { getServiceClient } from "../../core/supabase.ts";
import { logError, writeApiRequestLog } from "../../core/observability.ts";
import { writeAuditLog } from "../../core/audit.ts";
import { rateLimit } from "../../core/ratelimit.ts";
import { aiGateway } from "./service.ts";
import type { ProviderKey } from "./contract.ts";
import type { DomainContractMeta } from "../_gateway/types.ts";

export const EXTERNAL_API_ADAPTER_CONTRACT: DomainContractMeta = {
  domain: "external-api-adapter",
  version: "v1",
  operations: ["routePreview"],
} as const;

const RoutePreviewSchema = z.object({
  providerKey: z.enum(["flow", "wan"]),
  requestedModel: z.string().trim().min(1).max(100).optional(),
  prompt: z.string().min(1).max(4000),
});

export const externalApiAdapterGateway = {
  contract: EXTERNAL_API_ADAPTER_CONTRACT,

  async handle(req: Request, operation: string): Promise<Response> {
    const ctx = startRequest(req, `/${EXTERNAL_API_ADAPTER_CONTRACT.domain}/${operation}`);
    const svc = getServiceClient();
    try {
      if (req.method !== "POST") {
        return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405, ctx.requestId);
      }
      const auth = await authenticate(req);
      if (!auth) {
        await writeApiRequestLog(svc, { ...ctx, statusCode: 401, latencyMs: Date.now() - ctx.startedAt, errorCode: "UNAUTHORIZED" });
        return errorResponse("UNAUTHORIZED", "Missing or invalid token", 401, ctx.requestId);
      }

      switch (operation) {
        case "routePreview": {
          if (!rateLimit(`route-preview:${auth.userId}`, 30, 60_000)) {
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 429, latencyMs: Date.now() - ctx.startedAt, errorCode: "RATE_LIMITED" });
            return errorResponse("RATE_LIMITED", "Too many requests", 429, ctx.requestId);
          }

          let body: unknown;
          try { body = await req.json(); } catch {
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 400, latencyMs: Date.now() - ctx.startedAt, errorCode: "INVALID_JSON" });
            return errorResponse("INVALID_JSON", "Invalid JSON body", 400, ctx.requestId);
          }
          const parsed = RoutePreviewSchema.safeParse(body);
          if (!parsed.success) {
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 400, latencyMs: Date.now() - ctx.startedAt, errorCode: "VALIDATION_ERROR" });
            return jsonResponse({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, requestId: ctx.requestId }, 400);
          }

          const prompt = aiGateway.sanitizePrompt(parsed.data.prompt);
          const providerKey = parsed.data.providerKey as ProviderKey;
          const resolved = await aiGateway.resolveRoute(svc, providerKey, parsed.data.requestedModel, prompt);

          await writeApiRequestLog(svc, {
            ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt,
            providerKey: resolved.providerKey, modelKey: resolved.resolvedModel, estimatedCost: resolved.estimatedCost,
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
        }
        default:
          await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 404, latencyMs: Date.now() - ctx.startedAt, errorCode: "UNKNOWN_OPERATION" });
          return errorResponse("UNKNOWN_OPERATION", `Unknown operation: ${operation}`, 404, ctx.requestId);
      }
    } catch (e) {
      logError("external-api-adapter gateway unhandled", { error: (e as Error).message, operation });
      await writeApiRequestLog(svc, { ...ctx, statusCode: 500, latencyMs: Date.now() - ctx.startedAt, errorCode: "INTERNAL" });
      return errorResponse("INTERNAL", "Internal error", 500, ctx.requestId);
    }
  },
};
