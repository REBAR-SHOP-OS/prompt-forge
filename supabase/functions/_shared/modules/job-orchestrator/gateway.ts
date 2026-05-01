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
import { errorResponse, jsonResponse, startRequest } from "../../core/http.ts";
import { authenticate } from "../../core/auth.ts";
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
  operations: ["listMyJobs", "createJob", "getJob"],
} as const;

const CreateJobSchema = z.object({
  providerKey: z.enum(["flow", "wan"]),
  requestedModel: z.string().trim().min(1).max(100).optional(),
  prompt: z.string().min(1).max(4000),
});

const GetJobSchema = z.object({ jobId: z.string().uuid() });

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
          const detail = await jobService.getMyJob(auth.userId, parsed.data.jobId, userClient);
          if (!detail) {
            return errorResponse("NOT_FOUND", "Job not found", 404, ctx.requestId);
          }
          await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt });
          return jsonResponse({ ...detail, requestId: ctx.requestId });
        }

        case "createJob": {
          if (req.method !== "POST") {
            return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405, ctx.requestId);
          }
          if (!rateLimit(`jobs-create:${auth.userId}`, 10, 60_000)) {
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 429, latencyMs: Date.now() - ctx.startedAt, errorCode: "RATE_LIMITED" });
            return errorResponse("RATE_LIMITED", "Too many requests", 429, ctx.requestId);
          }
          let body: unknown;
          try { body = await req.json(); } catch {
            return errorResponse("INVALID_JSON", "Invalid JSON body", 400, ctx.requestId);
          }
          const parsed = CreateJobSchema.safeParse(body);
          if (!parsed.success) {
            return jsonResponse({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors }, requestId: ctx.requestId }, 400);
          }

          const prompt = aiGateway.sanitizePrompt(parsed.data.prompt);
          const providerKey = parsed.data.providerKey as ProviderKey;

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
            });
          } catch (e) {
            const msg = (e as Error).message;
            const code = msg.includes("insufficient credits") ? "INSUFFICIENT_CREDITS" : "JOB_START_FAILED";
            const status = code === "INSUFFICIENT_CREDITS" ? 402 : 500;
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: status, latencyMs: Date.now() - ctx.startedAt, errorCode: code });
            return errorResponse(code, msg, status, ctx.requestId);
          }

          // Trigger generation through the adapter contract.
          let gen;
          try {
            gen = await aiGateway.startGeneration(route.providerKey, route.resolvedModel, prompt);
          } catch (e) {
            logError("startGeneration failed", { error: (e as Error).message, jobId });
            return errorResponse("PROVIDER_ERROR", "Provider failed to start generation", 502, ctx.requestId);
          }

          await jobService.markProcessing(svc, auth.userId, jobId, gen.providerJobId);

          let videoAssetId: string | null = null;
          let finalStatus: "processing" | "completed" = "processing";
          if (gen.isComplete && gen.videoUrl) {
            videoAssetId = await jobService.completeJob(svc, {
              userId: auth.userId,
              jobId,
              storagePath: gen.videoUrl,
              thumbnailUrl: gen.thumbnailUrl,
              aspectRatio: gen.aspectRatio,
              duration: gen.duration,
            });
            finalStatus = "completed";
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
