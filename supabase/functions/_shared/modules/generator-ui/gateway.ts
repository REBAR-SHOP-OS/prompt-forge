// Generator-UI — domain gateway (single public ingress for this domain).
//
// Public contract (v1):
//   - getMe() -> MeProfile        (auth required; RLS-enforced read)
//
// Note: routePreview is owned by external-api-adapter; the dashboard reaches
// it via that domain's gateway, not through this one.

import { z } from "https://esm.sh/zod@3.23.8";
import { errorResponse, jsonResponse, readJsonBody, startRequest } from "../../core/http.ts";
import { authenticate } from "../../core/auth.ts";
import { getServiceClient, getUserScopedClient } from "../../core/supabase.ts";
import { logError, writeApiRequestLog } from "../../core/observability.ts";
import { writeAuditLog } from "../../core/audit.ts";
import { rateLimit } from "../../core/ratelimit.ts";
import type { DomainContractMeta } from "../_gateway/types.ts";

export const GENERATOR_UI_CONTRACT: DomainContractMeta = {
  domain: "generator-ui",
  version: "v1",
  operations: ["getMe", "deleteUserImage"],
} as const;

const DeleteImageSchema = z.object({ imageId: z.string().uuid() });
const USER_IMAGES_BUCKET = "user-images";

function extractBucketPath(raw: string, bucket: string): string | null {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    const m = raw.match(new RegExp(`/storage/v1/object/(?:public/)?${bucket}/(.+)$`));
    return m ? decodeURIComponent(m[1]) : null;
  }
  if (raw.startsWith(`${bucket}/`)) return raw.slice(bucket.length + 1);
  return raw; // assume already a path inside the bucket
}

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
        case "deleteUserImage": {
          if (req.method !== "POST") {
            return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405, ctx.requestId);
          }
          if (!rateLimit(`images-delete:${auth.userId}`, 60, 60_000)) {
            return errorResponse("RATE_LIMITED", "Too many requests", 429, ctx.requestId);
          }
          const bodyResult = await readJsonBody<unknown>(req, ctx.requestId);
          if (!bodyResult.ok) return bodyResult.response;
          const parsed = DeleteImageSchema.safeParse(bodyResult.value);
          if (!parsed.success) {
            return errorResponse("VALIDATION_ERROR", "imageId required", 400, ctx.requestId);
          }
          const { data: rawPath, error: rpcErr } = await svc.rpc("generator_delete_user_image", {
            _user_id: auth.userId,
            _image_id: parsed.data.imageId,
          });
          if (rpcErr) {
            logError("delete user image rpc failed", { error: rpcErr.message });
            return errorResponse("DELETE_FAILED", rpcErr.message, 500, ctx.requestId);
          }
          if (typeof rawPath === "string" && rawPath.length > 0) {
            const path = extractBucketPath(rawPath, USER_IMAGES_BUCKET);
            if (path) {
              try {
                const { error: rmErr } = await svc.storage.from(USER_IMAGES_BUCKET).remove([path]);
                if (rmErr) logError("user-images storage remove failed", { error: rmErr.message });
              } catch (e) {
                logError("user-images storage remove threw", { error: (e as Error).message });
              }
            }
          }
          await writeAuditLog(svc, {
            actorUserId: auth.userId,
            action: "generator_ui.delete_user_image",
            targetType: "user_image",
            targetId: parsed.data.imageId,
            requestId: ctx.requestId,
            metadata: { hadFile: typeof rawPath === "string" && rawPath.length > 0 },
          });
          await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt });
          return jsonResponse({ ok: true, imageId: parsed.data.imageId, requestId: ctx.requestId });
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
