// Job-Orchestrator — domain gateway (single public ingress for this domain).
//
// Public contract (v1):
//   - listMyJobs() -> { items: JobSummary[] }
//   - createJob({ providerKey, requestedModel?, prompt }) -> { jobId, status, video? }
//   - getJob({ jobId })  -> JobDetail
//
// createJob orchestrates: external-api-adapter.resolveRoute → start_job RPC
// (atomic credit debit) → external-api-adapter.startGeneration → if complete,
// complete_job RPC (writes asset + flips status). If async, leaves job in
// "processing" for the worker/poller to finish in a later phase.

import { z } from "https://esm.sh/zod@3.23.8";
import { errorResponse, jsonResponse, readJsonBody, startRequest } from "../../core/http.ts";
import { authenticate } from "../../core/auth.ts";
import { getEnv } from "../../core/env.ts";
import { getServiceClient, getUserScopedClient } from "../../core/supabase.ts";
import { logError, writeApiRequestLog } from "../../core/observability.ts";
import { writeAuditLog } from "../../core/audit.ts";
import { rateLimit } from "../../core/ratelimit.ts";
import { jobService } from "./service.ts";
import { aiGateway } from "../external-api-adapter/service.ts";
import type { ProviderKey } from "../external-api-adapter/contract.ts";
import type { DomainContractMeta } from "../_gateway/types.ts";

export const JOB_ORCHESTRATOR_CONTRACT: DomainContractMeta = {
  domain: "job-orchestrator",
  version: "v1",
  operations: ["listMyJobs", "createJob", "getJob", "deleteJob"],
} as const;

const CreateJobSchema = z.object({
  providerKey: z.literal("wan"),
  requestedModel: z.string().trim().min(1).max(100).optional(),
  prompt: z.string().min(1).max(4000),
  firstFrameUrl: z.string().url().max(2048).optional(),
  lastFrameUrl: z.string().url().max(2048).optional(),
  durationSeconds: z.union([z.literal(5), z.literal(10), z.literal(15)]).optional(),
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]).optional(),
});

const GetJobSchema = z.object({ jobId: z.string().uuid() });
const DeleteJobSchema = z.object({ jobId: z.string().uuid() });

const SUPABASE_PUBLIC_STORAGE_PREFIX = `${new URL(getEnv("SUPABASE_URL")).origin}/storage/v1/object/public/wan-frames/`;
const EXTRA_PUBLIC_FRAME_HOSTS = getEnv("ALLOWED_PUBLIC_FRAME_HOSTS", false)
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

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
    const prefix = `/storage/v1/object/public/wan-frames/${userId}/`;
    return path.startsWith(prefix);
  }

  return EXTRA_PUBLIC_FRAME_HOSTS.includes(parsed.hostname.toLowerCase());
}

// Estimate render progress when the provider hasn't reported one yet.
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
        return errorResponse("UNAUTHORIZED", "Missing or invalid token", 401, ctx.requestId);
      }

      const userClient = getUserScopedClient(auth.authHeader);

      switch (operation) {
        case "listMyJobs": {
          const items = await jobService.listMyJobs(auth.userId, userClient);
          await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt });
          return jsonResponse({ items, requestId: ctx.requestId });
        }

        case "getJob": {
          const url = new URL(req.url);
          const jobIdParam = url.searchParams.get("jobId") ?? undefined;
          const parsed = GetJobSchema.safeParse({ jobId: jobIdParam });
          if (!parsed.success) {
            return errorResponse("VALIDATION_ERROR", "jobId required", 400, ctx.requestId);
          }
          let detail = await jobService.getMyJob(auth.userId, parsed.data.jobId, userClient);
          if (!detail) {
            return errorResponse("NOT_FOUND", "Job not found", 404, ctx.requestId);
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
                await svc
                  .from("generator_generation_jobs")
                  .update({ status: "failed", updated_at: new Date().toISOString() })
                  .eq("id", detail.id)
                  .eq("user_id", auth.userId);
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
          return jsonResponse({ ...detail, progress_percent: progressPercent, requestId: ctx.requestId });
        }

        case "createJob": {
          if (req.method !== "POST") {
            return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405, ctx.requestId);
          }
          if (!rateLimit(`jobs-create:${auth.userId}`, 10, 60_000)) {
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 429, latencyMs: Date.now() - ctx.startedAt, errorCode: "RATE_LIMITED" });
            return errorResponse("RATE_LIMITED", "Too many requests", 429, ctx.requestId);
          }

          const bodyResult = await readJsonBody<unknown>(req, ctx.requestId);
          if (!bodyResult.ok) {
            return bodyResult.response;
          }

          const parsed = CreateJobSchema.safeParse(bodyResult.value);
          if (!parsed.success) {
            return jsonResponse({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, requestId: ctx.requestId }, 400);
          }

          const prompt = aiGateway.sanitizePrompt(parsed.data.prompt);
          const providerKey = parsed.data.providerKey as ProviderKey;
          const firstFrameUrl = parsed.data.firstFrameUrl ?? null;
          const lastFrameUrl = parsed.data.lastFrameUrl ?? null;

          if (firstFrameUrl && !isAllowedFrameUrl(firstFrameUrl, auth.userId)) {
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 400, latencyMs: Date.now() - ctx.startedAt, errorCode: "INVALID_FIRST_FRAME_URL" });
            return errorResponse(
              "INVALID_FIRST_FRAME_URL",
              "firstFrameUrl must point to your own public wan-frames upload",
              400,
              ctx.requestId,
            );
          }

          if (lastFrameUrl && !isAllowedFrameUrl(lastFrameUrl, auth.userId)) {
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 400, latencyMs: Date.now() - ctx.startedAt, errorCode: "INVALID_LAST_FRAME_URL" });
            return errorResponse(
              "INVALID_LAST_FRAME_URL",
              "lastFrameUrl must point to your own public wan-frames upload",
              400,
              ctx.requestId,
            );
          }

          // Image-to-video accepts one or both frames; text-to-video provides
          // neither. No additional cross-frame validation needed here.


          // Cross-domain call via external-api-adapter contract.
          const route = await aiGateway.resolveRoute(svc, providerKey, parsed.data.requestedModel, prompt);

          // Atomic: validate credits + create pending job + debit.
          const chosenAspectRatio = parsed.data.aspectRatio ?? "16:9";
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
              aspectRatio: chosenAspectRatio,
              durationSeconds: parsed.data.durationSeconds ?? null,
            });
          } catch (e) {
            const msg = (e as Error).message;
            logError("createJob failed", { error: msg });
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 500, latencyMs: Date.now() - ctx.startedAt, errorCode: "JOB_START_FAILED" });
            return errorResponse("JOB_START_FAILED", "Could not start the job. Please try again.", 500, ctx.requestId);
          }

          // Trigger generation through the adapter contract.
          let gen;
          try {
            gen = await aiGateway.startGeneration(route.providerKey, route.resolvedModel, {
              prompt,
              firstFrameUrl,
              lastFrameUrl,
              durationSeconds: parsed.data.durationSeconds ?? null,
              aspectRatio: chosenAspectRatio,
            });
          } catch (e) {
            // failJob RPC may not exist; fall back to a direct status update so
            // we don't mask the original error with a secondary failure.
            try {
              await svc.from("generator_generation_jobs")
                .update({ status: "failed", updated_at: new Date().toISOString() })
                .eq("id", jobId).eq("user_id", auth.userId);
            } catch (_) { /* best-effort */ }
            logError("startGeneration failed", { error: (e as Error).message, jobId });
            return errorResponse("PROVIDER_ERROR", "The video provider could not start generation. Please try again.", 502, ctx.requestId);
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
            return errorResponse("JOB_STATE_ERROR", "Could not update job state", 500, ctx.requestId);
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
              return errorResponse("JOB_COMPLETE_ERROR", "Could not finalize generated video", 500, ctx.requestId);
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

          return jsonResponse({
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
            return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405, ctx.requestId);
          }
          if (!rateLimit(`jobs-delete:${auth.userId}`, 30, 60_000)) {
            return errorResponse("RATE_LIMITED", "Too many requests", 429, ctx.requestId);
          }

          const bodyResult = await readJsonBody<unknown>(req, ctx.requestId);
          if (!bodyResult.ok) {
            return bodyResult.response;
          }

          const parsed = DeleteJobSchema.safeParse(bodyResult.value);
          if (!parsed.success) {
            return errorResponse("VALIDATION_ERROR", "jobId required", 400, ctx.requestId);
          }

          let storagePaths: string[] = [];
          try {
            storagePaths = await jobService.deleteJob(svc, auth.userId, parsed.data.jobId);
          } catch (e) {
            const msg = (e as Error).message;
            logError("deleteJob failed", { error: msg, jobId: parsed.data.jobId });
            const isNotFound = msg.toLowerCase().includes("not found");
            const code = isNotFound ? "NOT_FOUND" : "DELETE_FAILED";
            const status = isNotFound ? 404 : 500;
            const safe = isNotFound ? "Job not found" : "Could not delete job. Please try again.";
            return errorResponse(code, safe, status, ctx.requestId);
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
          return jsonResponse({ ok: true, jobId: parsed.data.jobId, requestId: ctx.requestId });
        }

        default:
          return errorResponse("UNKNOWN_OPERATION", `Unknown operation: ${operation}`, 404, ctx.requestId);
      }
    } catch (e) {
      logError("job-orchestrator gateway unhandled", { error: (e as Error).message, operation });
      await writeApiRequestLog(svc, { ...ctx, statusCode: 500, latencyMs: Date.now() - ctx.startedAt, errorCode: "INTERNAL" });
      return errorResponse("INTERNAL", "Internal error", 500, ctx.requestId);
    }
  },
};
