// Job-Orchestrator — domain gateway (single public ingress for this domain).
//
// Public contract (v1):
//   - listMyJobs() -> JobSummary[]
//   - getJob({ jobId }) -> JobDetail
//   - createJob({ providerKey, requestedModel?, prompt, durationSeconds?, firstFrameUrl?, lastFrameUrl? })
//       auth required; validates credits; creates pending job; debits; transitions to
//       "processing" for the worker/poller to finish in a later phase.
//   - deleteJob({ jobId })
//       auth required; soft-deletes job record + best-effort storage purge.

import { z } from "https://esm.sh/zod@3.23.8";
import { errorResponse, jsonResponse, methodNotAllowed, readJsonBody, startRequest } from "../../core/http.ts";
import { getEnv } from "../../core/env.ts";
import { authenticate } from "../../core/auth.ts";
import { getServiceClient, getUserScopedClient } from "../../core/supabase.ts";
import { logError, writeApiRequestLog } from "../../core/observability.ts";
import { writeAuditLog } from "../../core/audit.ts";
import { rateLimit } from "../../core/ratelimit.ts";
import { aiGateway } from "../external-api-adapter/service.ts";
import type { ProviderKey } from "../external-api-adapter/contract.ts";
import { jobService } from "./service.ts";
import type { DomainContractMeta } from "../_gateway/types.ts";

export const JOB_ORCHESTRATOR_CONTRACT: DomainContractMeta = {
  domain: "job-orchestrator",
  version: "v1",
  operations: ["listMyJobs", "getJob", "createJob", "deleteJob"],
} as const;

const CreateJobSchema = z.object({
  providerKey: z.enum(["flow", "wan"]),
  requestedModel: z.string().trim().min(1).max(100).optional(),
  prompt: z.string().min(1).max(4000),
  durationSeconds: z.union([z.literal(5), z.literal(10), z.literal(15)]).nullable().optional(),
  firstFrameUrl: z.string().url().optional(),
  lastFrameUrl: z.string().url().optional(),
});

const DeleteJobSchema = z.object({
  jobId: z.string().uuid(),
});

const GetJobSchema = z.object({
  jobId: z.string().uuid(),
});

const FRAME_BUCKET = "wan-frames";
const SUPABASE_PUBLIC_STORAGE_PREFIX = `${new URL(getEnv("SUPABASE_URL")).origin}/storage/v1/object/public/${FRAME_BUCKET}/`;
const EXTRA_PUBLIC_FRAME_HOSTS = getEnv("ALLOWED_PUBLIC_FRAME_HOSTS", false)
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const ALLOWED_FRAME_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_MAX_FRAME_BYTES = 10 * 1024 * 1024;
const MAX_FRAME_BYTES = (() => {
  const raw = Number.parseInt(getEnv("MAX_PUBLIC_FRAME_BYTES", false) || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_FRAME_BYTES;
})();

function isAllowedFrameUrl(url: string, userId: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  if (parsed.href.startsWith(SUPABASE_PUBLIC_STORAGE_PREFIX)) {
    const path = parsed.pathname;
    const prefix = `/storage/v1/object/public/${FRAME_BUCKET}/${userId}/`;
    return path.startsWith(prefix);
  }

  return EXTRA_PUBLIC_FRAME_HOSTS.includes(parsed.hostname.toLowerCase());
}

function getOwnedFrameObjectPath(url: string, userId: string): string | null {
  if (!url.startsWith(SUPABASE_PUBLIC_STORAGE_PREFIX)) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const prefix = `/storage/v1/object/public/${FRAME_BUCKET}/${userId}/`;
    if (!parsed.pathname.startsWith(prefix)) {
      return null;
    }
    const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return path.trim() ? path : null;
  } catch {
    return null;
  }
}

function normalizeMetadataString(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeMetadataNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

async function validateOwnedSupabaseFrameAsset(
  svc: ReturnType<typeof getServiceClient>,
  url: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const objectPath = getOwnedFrameObjectPath(url, userId);
  if (!objectPath) {
    return {
      ok: false,
      code: "INVALID_FRAME_URL",
      message: "Frame URL must stay inside your own wan-frames folder",
    };
  }

  const filename = objectPath.split("/").filter(Boolean).pop();
  if (!filename) {
    return {
      ok: false,
      code: "INVALID_FRAME_URL",
      message: "Frame URL is missing a file name",
    };
  }

  const { data, error } = await svc.storage.from(FRAME_BUCKET).list(userId, {
    limit: 100,
    search: filename,
  });
  if (error) {
    logError("frame metadata lookup failed", { error: error.message, userId, filename });
    return {
      ok: false,
      code: "FRAME_LOOKUP_FAILED",
      message: "Could not verify uploaded frame metadata",
    };
  }

  const entry = (data ?? []).find((item) => item.name === filename);
  if (!entry) {
    return {
      ok: false,
      code: "FRAME_NOT_FOUND",
      message: "Uploaded frame was not found in storage",
    };
  }

  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
  const mimeType = normalizeMetadataString(metadata.mimetype ?? metadata.contentType);
  const sizeBytes = normalizeMetadataNumber(metadata.size ?? metadata.contentLength);

  if (!ALLOWED_FRAME_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      code: "UNSUPPORTED_FRAME_TYPE",
      message: "Frames must be JPEG, PNG, or WebP images",
    };
  }

  if (sizeBytes <= 0 || sizeBytes > MAX_FRAME_BYTES) {
    return {
      ok: false,
      code: "FRAME_TOO_LARGE",
      message: `Frames must be smaller than ${Math.floor(MAX_FRAME_BYTES / (1024 * 1024))} MB`,
    };
  }

  return { ok: true };
}

// Estimates progress for processing jobs when the upstream provider or our
// job row doesn't have one yet.
// Uses status + created_at so the UI never shows a static "Rendering" with no
// numeric feedback. Bounded to [18, 95] while in flight.
function estimateProgressFromJob(status: string, createdAt: string | undefined): number | null {
  if (status === "completed") return 100;
  if (status === "failed" || status === "cancelled") return null;
  const startedAt = createdAt ? Date.parse(createdAt) : NaN;
  // ~2.5 min expected for 5s 720P i2v on Wan; adjust gently if it changes.
  const expectedMs = 150_000;
  if (!Number.isFinite(startedAt)) return status === "pending" ? 8 : 25;
  const elapsed = Date.now() - startedAt;
  const ratio = elapsed / expectedMs;
  return Math.max(status === "pending" ? 8 : 18, Math.min(95, Math.round(18 + ratio * 77)));
}

export const jobOrchestratorGateway = {
  contract: JOB_ORCHESTRATOR_CONTRACT,

  async handle(req: Request, operation: string): Promise<Response> {
    const ctx = startRequest(req, `/${JOB_ORCHESTRATOR_CONTRACT.domain}/${operation}`);
    const svc = getServiceClient();
    try {
      const auth = await authenticate(req);
      if (!auth) {
        await writeApiRequestLog(svc, { ...ctx, statusCode: 401, latencyMs: Date.now() - ctx.startedAt, errorCode: "UNAUTHORIZED" });
        return errorResponse(req, "UNAUTHORIZED", "Missing or invalid token", 401, ctx.requestId);
      }

      const userClient = getUserScopedClient(auth.authHeader);

      switch (operation) {
        case "listMyJobs": {
          if (req.method !== "GET" && req.method !== "HEAD") {
            return methodNotAllowed(req, ["GET", "HEAD"], ctx.requestId);
          }
          const limit = rateLimit(`jobs-list:${auth.userId}`, 30, 60_000);
          if (!limit.allowed) {
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 429, latencyMs: Date.now() - ctx.startedAt, errorCode: "RATE_LIMITED" });
            return errorResponse(req, "RATE_LIMITED", "Too many requests", 429, ctx.requestId, {
              "Retry-After": String(limit.retryAfterSeconds),
            });
          }
          const items = await jobService.listMyJobs(auth.userId, userClient);
          await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt });
          return jsonResponse(req, { items, requestId: ctx.requestId });
        }

        case "getJob": {
          if (req.method !== "GET" && req.method !== "HEAD") {
            return methodNotAllowed(req, ["GET", "HEAD"], ctx.requestId);
          }
          const limit = rateLimit(`jobs-get:${auth.userId}`, 120, 60_000);
          if (!limit.allowed) {
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 429, latencyMs: Date.now() - ctx.startedAt, errorCode: "RATE_LIMITED" });
            return errorResponse(req, "RATE_LIMITED", "Too many requests", 429, ctx.requestId, {
              "Retry-After": String(limit.retryAfterSeconds),
            });
          }
          const url = new URL(req.url);
          const jobIdParam = url.searchParams.get("jobId") ?? undefined;
          const parsed = GetJobSchema.safeParse({ jobId: jobIdParam });
          if (!parsed.success) {
            return errorResponse(req, "VALIDATION_ERROR", "jobId required", 400, ctx.requestId);
          }
          let detail = await jobService.getMyJob(auth.userId, parsed.data.jobId, userClient);
          if (!detail) {
            return errorResponse(req, "NOT_FOUND", "Job not found", 404, ctx.requestId);
          }

          let progressPercent: number | null = null;
          if (
            detail.status === "processing" &&
            detail.provider_job_id &&
            detail.provider_key
          ) {
            try {
              const poll = await aiGateway.pollGeneration(
                detail.provider_key as ProviderKey,
                detail.provider_job_id,
              );
              if (poll.status === "completed" && poll.videoUrl) {
                await jobService.completeJob(svc, {
                  userId: auth.userId,
                  jobId: detail.id,
                  storagePath: poll.videoUrl,
                  thumbnailUrl: poll.thumbnailUrl,
                  aspectRatio: poll.aspectRatio,
                  duration: poll.duration,
                });
                detail = await jobService.getMyJob(auth.userId, parsed.data.jobId, userClient) ?? detail;
                progressPercent = 100;
              } else if (poll.status === "failed") {
                const failureReason = poll.reason ?? "provider task failed";
                try {
                  await jobService.failJob(svc, {
                    userId: auth.userId,
                    jobId: detail.id,
                    reason: failureReason,
                    refundCredits: true,
                  });
                } catch (failError) {
                  await svc
                    .from("generator_generation_jobs")
                    .update({ status: "failed", updated_at: new Date().toISOString() })
                    .eq("id", detail.id)
                    .eq("user_id", auth.userId);
                  logError("job fail transition fallback used", {
                    error: (failError as Error).message,
                    jobId: detail.id,
                  });
                }
                detail = await jobService.getMyJob(auth.userId, parsed.data.jobId, userClient) ?? detail;
                progressPercent = null;
              } else {
                progressPercent = poll.progressPercent ?? estimateProgressFromJob(detail.status, detail.created_at);
              }
            } catch (e) {
              // Don't fail the request just because polling errored — return current state.
              logError("inline poll failed", { error: (e as Error).message, jobId: detail.id });
              progressPercent = estimateProgressFromJob(detail.status, detail.created_at);
            }
          } else {
            progressPercent = estimateProgressFromJob(detail.status, detail.created_at);
          }

          await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt });
          return jsonResponse(req, { ...detail, progress_percent: progressPercent, requestId: ctx.requestId });
        }

        case "createJob": {
          if (req.method !== "POST") {
            return methodNotAllowed(req, ["POST"], ctx.requestId);
          }
          const limit = rateLimit(`jobs-create:${auth.userId}`, 10, 60_000);
          if (!limit.allowed) {
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 429, latencyMs: Date.now() - ctx.startedAt, errorCode: "RATE_LIMITED" });
            return errorResponse(req, "RATE_LIMITED", "Too many requests", 429, ctx.requestId, {
              "Retry-After": String(limit.retryAfterSeconds),
            });
          }

          const bodyResult = await readJsonBody<unknown>(req, ctx.requestId);
          if (!bodyResult.ok) {
            return bodyResult.response;
          }

          const parsed = CreateJobSchema.safeParse(bodyResult.value);
          if (!parsed.success) {
            return jsonResponse(req, { error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, requestId: ctx.requestId }, 400);
          }

          const prompt = aiGateway.sanitizePrompt(parsed.data.prompt);
          const providerKey = parsed.data.providerKey as ProviderKey;
          const firstFrameUrl = parsed.data.firstFrameUrl ?? null;
          const lastFrameUrl = parsed.data.lastFrameUrl ?? null;

          if (providerKey !== "wan") {
            await writeApiRequestLog(svc, {
              ...ctx,
              userId: auth.userId,
              statusCode: 400,
              latencyMs: Date.now() - ctx.startedAt,
              errorCode: "UNSUPPORTED_PROVIDER",
            });
            return errorResponse(
              req,
              "UNSUPPORTED_PROVIDER",
              `Provider ${providerKey} is not enabled in the current production-safe build`,
              400,
              ctx.requestId,
            );
          }

          if (firstFrameUrl && !isAllowedFrameUrl(firstFrameUrl, auth.userId)) {
            return errorResponse(
              req,
              "INVALID_FIRST_FRAME_URL",
              "firstFrameUrl must point to your own public wan-frames upload",
              400,
              ctx.requestId,
            );
          }

          if (lastFrameUrl && !isAllowedFrameUrl(lastFrameUrl, auth.userId)) {
            return errorResponse(
              req,
              "INVALID_LAST_FRAME_URL",
              "lastFrameUrl must point to your own public wan-frames upload",
              400,
              ctx.requestId,
            );
          }

          if (firstFrameUrl) {
            const frameValidation = await validateOwnedSupabaseFrameAsset(svc, firstFrameUrl, auth.userId);
            if (!frameValidation.ok) {
              return errorResponse(req, frameValidation.code, frameValidation.message, 400, ctx.requestId);
            }
          }

          if (lastFrameUrl) {
            const frameValidation = await validateOwnedSupabaseFrameAsset(svc, lastFrameUrl, auth.userId);
            if (!frameValidation.ok) {
              return errorResponse(req, frameValidation.code, frameValidation.message, 400, ctx.requestId);
            }
          }

          // Image-to-video accepts a first frame by itself or a first+last pair.
          // Reject a last frame without a first frame.
          if (!firstFrameUrl && lastFrameUrl) {
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 400, latencyMs: Date.now() - ctx.startedAt, errorCode: "MISSING_FRAMES" });
            return errorResponse(req, "MISSING_FRAMES", "Image-to-video requires firstFrameUrl when lastFrameUrl is provided", 400, ctx.requestId);
          }

          // Cross-domain call via external-api-adapter contract.
          const route = await aiGateway.resolveRoute(svc, providerKey, parsed.data.requestedModel, prompt);

          // Atomic: validate credits + create pending job + debit.
          let jobId: string;
          try {
            jobId = await jobService.createJob(svc, {
              userId: auth.userId,
              prompt,
              providerKey: route.providerKey,
              modelKey: route.resolvedModel,
              estimatedCost: route.estimatedCost,
              firstFrameUrl,
              lastFrameUrl,
            });
          } catch (e) {
            const msg = (e as Error).message;
            const code = msg.includes("insufficient credits") ? "INSUFFICIENT_CREDITS" : "JOB_START_FAILED";
            const status = code === "INSUFFICIENT_CREDITS" ? 402 : 500;
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: status, latencyMs: Date.now() - ctx.startedAt, errorCode: code });
            return errorResponse(req, code, msg, status, ctx.requestId);
          }

          // Trigger generation through the adapter contract.
          let gen;
          try {
            gen = await aiGateway.startGeneration(route.providerKey, route.resolvedModel, {
              prompt,
              firstFrameUrl,
              lastFrameUrl,
              durationSeconds: parsed.data.durationSeconds ?? null,
            });
          } catch (e) {
            try {
              await jobService.failJob(svc, {
                userId: auth.userId,
                jobId,
                reason: (e as Error).message,
                refundCredits: true,
              });
            } catch (failError) {
              try {
                await svc.from("generator_generation_jobs")
                  .update({ status: "failed", updated_at: new Date().toISOString() })
                  .eq("id", jobId)
                  .eq("user_id", auth.userId);
              } catch (_) {
                /* best-effort */
              }
              logError("failJob after startGeneration failed", {
                error: (failError as Error).message,
                jobId,
              });
            }
            logError("startGeneration failed", { error: (e as Error).message, jobId });
            return errorResponse(req, "PROVIDER_ERROR", `Provider failed to start generation: ${(e as Error).message}`, 502, ctx.requestId);
          }

          try {
            await jobService.markProcessing(svc, auth.userId, jobId, gen.providerJobId);
          } catch (e) {
            await jobService.failJob(svc, {
              userId: auth.userId,
              jobId,
              reason: (e as Error).message,
              refundCredits: true,
            });
            logError("markProcessing failed", { error: (e as Error).message, jobId });
            return errorResponse(req, "JOB_STATE_ERROR", "Could not update job state", 500, ctx.requestId);
          }

          let videoAssetId: string | null = null;
          let finalStatus: "processing" | "completed" = "processing";
          if (gen.isComplete && gen.videoUrl) {
            try {
              videoAssetId = await jobService.completeJob(svc, {
                userId: auth.userId,
                jobId,
                storagePath: gen.videoUrl,
                thumbnailUrl: gen.thumbnailUrl,
                aspectRatio: gen.aspectRatio,
                duration: gen.duration,
              });
              finalStatus = "completed";
            } catch (e) {
              await jobService.failJob(svc, {
                userId: auth.userId,
                jobId,
                reason: (e as Error).message,
                refundCredits: true,
              });
              logError("completeJob failed", { error: (e as Error).message, jobId });
              return errorResponse(req, "JOB_COMPLETE_ERROR", "Could not finalize generated video", 500, ctx.requestId);
            }
          }

          await writeAuditLog(svc, {
            actorUserId: auth.userId,
            action: "job_orchestrator.create_job",
            targetType: "generation_job",
            targetId: jobId,
            requestId: ctx.requestId,
            metadata: { provider: route.providerKey, model: route.resolvedModel, status: finalStatus },
          });
          await writeApiRequestLog(svc, {
            ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt,
            providerKey: route.providerKey, modelKey: route.resolvedModel, estimatedCost: route.estimatedCost,
          });

          return jsonResponse(req, {
            jobId,
            status: finalStatus,
            videoAssetId,
            providerKey: route.providerKey,
            resolvedModel: route.resolvedModel,
            requestId: ctx.requestId,
          });
        }

        case "deleteJob": {
          if (req.method !== "POST") {
            return methodNotAllowed(req, ["POST"], ctx.requestId);
          }
          const limit = rateLimit(`jobs-delete:${auth.userId}`, 30, 60_000);
          if (!limit.allowed) {
            return errorResponse(req, "RATE_LIMITED", "Too many requests", 429, ctx.requestId, {
              "Retry-After": String(limit.retryAfterSeconds),
            });
          }

          const bodyResult = await readJsonBody<unknown>(req, ctx.requestId);
          if (!bodyResult.ok) {
            return bodyResult.response;
          }

          const parsed = DeleteJobSchema.safeParse(bodyResult.value);
          if (!parsed.success) {
            return errorResponse(req, "VALIDATION_ERROR", "jobId required", 400, ctx.requestId);
          }

          let storagePaths: string[] = [];
          try {
            storagePaths = await jobService.deleteJob(svc, auth.userId, parsed.data.jobId);
          } catch (e) {
            const msg = (e as Error).message;
            const code = msg.includes("not found") ? "NOT_FOUND" : "DELETE_FAILED";
            const status = code === "NOT_FOUND" ? 404 : 500;
            return errorResponse(req, code, msg, status, ctx.requestId);
          }

          // Best-effort: purge files from Storage. Group by bucket.
          // storage_path may be a full URL (external provider) or a
          // "<bucket>/<path>" string. We only delete from our own buckets.
          const KNOWN_BUCKETS = ["merged-videos", "wan-frames"];
          const byBucket: Record<string, string[]> = {};
          for (const raw of storagePaths) {
            if (!raw || /^https?:\/\//i.test(raw)) {
              // Try to extract bucket+path from a Supabase storage URL.
              const m = raw.match(/\/storage\/v1\/object\/(?:public\/)?([^/]+)\/(.+)$/);
              if (m && KNOWN_BUCKETS.includes(m[1])) {
                (byBucket[m[1]] ??= []).push(decodeURIComponent(m[2]));
              }
              continue;
            }
            const bucket = KNOWN_BUCKETS.find((b) => raw.startsWith(`${b}/`));
            if (bucket) (byBucket[bucket] ??= []).push(raw.slice(bucket.length + 1));
          }
          for (const [bucket, paths] of Object.entries(byBucket)) {
            try {
              const { error: rmErr } = await svc.storage.from(bucket).remove(paths);
              if (rmErr) logError("storage remove failed", { bucket, error: rmErr.message });
            } catch (e) {
              logError("storage remove threw", { bucket, error: (e as Error).message });
            }
          }

          await writeAuditLog(svc, {
            actorUserId: auth.userId,
            action: "job_orchestrator.delete_job",
            targetType: "generation_job",
            targetId: parsed.data.jobId,
            requestId: ctx.requestId,
            metadata: { purgedFiles: storagePaths.length },
          });
          await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt });
          return jsonResponse(req, { ok: true, jobId: parsed.data.jobId, requestId: ctx.requestId });
        }

        default:
          return errorResponse(req, "UNKNOWN_OPERATION", `Unknown operation: ${operation}`, 404, ctx.requestId);
      }
    } catch (e) {
      logError("job-orchestrator gateway unhandled", { error: (e as Error).message, operation });
      await writeApiRequestLog(svc, { ...ctx, statusCode: 500, latencyMs: Date.now() - ctx.startedAt, errorCode: "INTERNAL" });
      return errorResponse(req, "INTERNAL", "Internal error", 500, ctx.requestId);
    }
  },
};