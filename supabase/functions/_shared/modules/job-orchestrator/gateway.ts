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
import { logError, logInfo, writeApiRequestLog } from "../../core/observability.ts";
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
  providerKey: z.enum(["wan", "flow", "local"]),
  requestedModel: z.string().trim().min(1).max(100).optional(),
  prompt: z.string().min(1).max(16000),
  firstFrameUrl: z.string().url().max(2048).optional(),
  lastFrameUrl: z.string().url().max(2048).optional(),
  /** Persistent character/reference image URL(s) for identity anchoring (max 3). */
  referenceImageUrls: z.array(z.string().url().max(2048)).max(3).optional(),
  durationSeconds: z.union([z.literal(5), z.literal(10), z.literal(15)]).optional(),
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]).optional(),
  /** Durable per-project group id so all clips in one session stay one draft. */
  draftGroupId: z.string().uuid().optional(),
  /** Authoritative narration (spoken lines) written in the scenario for this card. */
  narrationText: z.string().max(8000).optional(),
});

const GetJobSchema = z.object({ jobId: z.string().uuid() });
const DeleteJobSchema = z.object({ jobId: z.string().uuid() });

const SUPABASE_STORAGE_ORIGIN = new URL(getEnv("SUPABASE_URL")).origin;

// Local video routers (ComfyUI/Wan/LTX on the RTX box) often return the clip
// inline as a `data:video/mp4;base64,...` URL instead of a hosted link. Storing
// that multi-MB string in the asset row bloats the DB and the preview fails to
// load it. Decode such payloads once and upload to our video bucket, returning a
// real URL — mirroring the Veo download/re-upload path. Non-data URLs pass
// through unchanged.
// Persist a completed video into our own durable storage so playback never
// breaks when a provider's temporary URL expires.
//   - data:        -> decode + upload (local-LLM router path)
//   - our storage  -> return as-is (already durable; no needless re-copy)
//   - http(s) other -> download provider bytes + re-host, with a safe fallback
//                      to the original URL if the download/upload fails (so a
//                      job never falsely fails or refunds credits).
async function materializeVideoUrl(
  svc: ReturnType<typeof getServiceClient>,
  userId: string,
  videoUrl: string,
): Promise<string> {
  // 1) Local-LLM router data URLs — decode and upload.
  if (videoUrl.startsWith("data:")) {
    const match = videoUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) throw new Error("Local router returned an unparseable data URL");
    const contentType = match[1] || "video/mp4";
    const isBase64 = Boolean(match[2]);
    const rawData = match[3] ?? "";

    let bytes: Uint8Array;
    if (isBase64) {
      const binary = atob(rawData);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(rawData));
    }

    const ext = contentType.includes("webm") ? "webm" : "mp4";
    const path = `${userId}/local-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await svc.storage
      .from("merged-videos")
      .upload(path, bytes, { contentType, upsert: false });
    if (upErr) {
      logError("local video upload failed", { error: upErr.message, path });
      throw new Error(`Local video upload failed: ${upErr.message}`);
    }
    const { data: pub } = svc.storage.from("merged-videos").getPublicUrl(path);
    return pub.publicUrl;
  }

  // 2) Anything that already lives in our own Supabase storage is durable.
  const ownStoragePrefix = `${new URL(getEnv("SUPABASE_URL")).origin}/storage/v1/object/`;
  if (videoUrl.startsWith(ownStoragePrefix)) return videoUrl;

  // 3) External provider URL (e.g. DashScope/WAN): these are short-lived and
  //    expire, leaving blank cards. Download the bytes and re-host in our own
  //    private bucket so playback stays durable.
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") || "video/mp4";
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error("download returned 0 bytes");

    const ext = contentType.includes("webm")
      ? "webm"
      : (videoUrl.split("?")[0].toLowerCase().endsWith(".webm") ? "webm" : "mp4");
    const uploadType = ext === "webm" ? "video/webm" : "video/mp4";
    const path = `${userId}/job-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await svc.storage
      .from("merged-videos")
      .upload(path, bytes, { contentType: uploadType, upsert: false });
    if (upErr) throw new Error(`upload failed: ${upErr.message}`);

    const { data: pub } = svc.storage.from("merged-videos").getPublicUrl(path);
    logInfo("provider video re-hosted", { userId, bytes: bytes.byteLength, path });
    return pub.publicUrl;
  } catch (e) {
    // Non-fatal: keep the provider URL so the job still completes and is
    // playable short-term. We never fail/refund a job over re-hosting.
    logError("provider video re-host failed, keeping provider URL", {
      error: (e as Error).message,
    });
    return videoUrl;
  }
}
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

  // Only trust URLs hosted on our own Supabase storage origin.
  if (parsed.origin === SUPABASE_STORAGE_ORIGIN) {
    const path = parsed.pathname;
    // Accept both public and signed object URLs for the caller's own wan-frames
    // uploads. The frontend signs private-bucket frames for preview, so the
    // path arrives as /object/sign/... rather than /object/public/...
    const publicPrefix = `/storage/v1/object/public/wan-frames/${userId}/`;
    const signPrefix = `/storage/v1/object/sign/wan-frames/${userId}/`;
    return path.startsWith(publicPrefix) || path.startsWith(signPrefix);
  }

  return EXTRA_PUBLIC_FRAME_HOSTS.includes(parsed.hostname.toLowerCase());
}

// Estimate render progress when the provider hasn't reported one yet.
// Capped conservatively so the UI never falsely implies "almost done".
// Real provider progress (when present) is honored as-is up to 99 — only
// actual completion returns 100.
function expectedRenderMsForDuration(durationSeconds: number | null | undefined): number {
  const dur = durationSeconds && durationSeconds > 0 ? durationSeconds : 5;
  return Math.max(120_000, dur * 30_000);
}

function estimateProgressFromJob(
  status: string,
  createdAt: string | undefined,
  durationSeconds?: number | null,
): number | null {
  if (status === "completed") return 100;
  if (status === "failed" || status === "cancelled") return null;
  const startedAt = createdAt ? Date.parse(createdAt) : NaN;
  const expectedMs = expectedRenderMsForDuration(durationSeconds);
  if (!Number.isFinite(startedAt)) return status === "pending" ? 8 : 20;
  const elapsed = Date.now() - startedAt;
  const ratio = elapsed / expectedMs;
  if (status === "pending") return Math.max(8, Math.min(20, Math.round(8 + ratio * 12)));
  // Ramp to 60 over the expected window, then creep slowly toward ~95 so a
  // long-running provider job doesn't appear frozen. Only real completion = 100.
  if (ratio <= 1) return Math.max(15, Math.round(15 + ratio * 45));
  const tail = ratio - 1;
  return Math.min(95, Math.round(60 + (tail / (tail + 3)) * 35));
}

// Dynamic hard-timeout: longer clips legitimately take longer; we still
// guarantee no job stays "processing" forever.
function stuckTimeoutMsForDuration(durationSeconds: number | null | undefined): number {
  const dur = durationSeconds && durationSeconds > 0 ? durationSeconds : 5;
  // Floor at 15min for short clips, scale up for longer ones, cap at 45min.
  return Math.min(45 * 60_000, Math.max(15 * 60_000, dur * 2.5 * 60_000));
}

function buildStatusMessage(
  status: string,
  createdAt: string | undefined,
  durationSeconds: number | null | undefined,
  hasError: boolean,
): string | null {
  if (status === "completed") return "Ready";
  if (status === "failed") return hasError ? "Render failed — credits refunded" : "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "pending") return "Queued — waiting for provider";
  // processing
  const startedAt = createdAt ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(startedAt)) return "Rendering";
  const elapsedMin = (Date.now() - startedAt) / 60_000;
  const expectedMin = expectedRenderMsForDuration(durationSeconds) / 60_000;
  if (elapsedMin < expectedMin * 0.8) return "Rendering";
  if (elapsedMin < expectedMin * 1.5) return "Still rendering — almost there";
  return "Still rendering — provider is taking longer than usual";
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
          const limitParam = Number(new URL(req.url).searchParams.get("limit"));
          const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(500, Math.floor(limitParam)) : undefined;
          const items = await jobService.listMyJobs(auth.userId, userClient, limit);
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
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt, errorCode: "NOT_FOUND" });
            return jsonResponse({ error: { code: "NOT_FOUND", message: "Job not found" }, missing: true, requestId: ctx.requestId });
          }

          let progressPercent: number | null = null;
          let terminalFailedReason: string | null = null;
          const requestedDuration = (detail as { requested_duration?: number | null }).requested_duration ?? null;
          if (
            detail.status === "processing" &&
            detail.provider_job_id &&
            detail.provider_key
          ) {
            try {
              const poll = await aiGateway.pollGeneration(
                detail.provider_key as ProviderKey,
                detail.provider_job_id,
                { client: svc, userId: auth.userId },
              );
              logInfo("inline poll result", {
                jobId: detail.id,
                provider: detail.provider_key,
                pollStatus: poll.status,
                pollProgress: poll.progressPercent ?? null,
                hasVideo: Boolean(poll.videoUrl),
              });
              if (poll.status === "completed" && poll.videoUrl) {
                const storagePath = await materializeVideoUrl(svc, auth.userId, poll.videoUrl);
                await jobService.completeJob(svc, {
                  userId: auth.userId,
                  jobId: detail.id,
                  storagePath,
                  thumbnailUrl: poll.thumbnailUrl,
                  aspectRatio: poll.aspectRatio,
                  duration: poll.duration,
                });
                detail = await jobService.getMyJob(auth.userId, parsed.data.jobId, userClient) ?? detail;
                progressPercent = 100;
              } else if (poll.status === "failed") {
                terminalFailedReason = poll.reason ?? "Generation failed";
                try {
                  await jobService.failJob(svc, {
                    userId: auth.userId,
                    jobId: detail.id,
                    reason: poll.reason ?? null,
                    refundCredits: true,
                  });
                  detail = await jobService.getMyJob(auth.userId, parsed.data.jobId, userClient) ?? detail;
                } catch (e) {
                  logError("failJob persist failed", { error: (e as Error).message, jobId: detail.id });
                }
                progressPercent = null;
              } else {
                // Persist updated durable provider state (e.g. Veo extension
                // handoff) so a later poll picks up the right operation even
                // after an edge function restart.
                if (poll.providerJobId && poll.providerJobId !== detail.provider_job_id) {
                  try {
                    await jobService.markProcessing(svc, auth.userId, detail.id, poll.providerJobId);
                    detail = await jobService.getMyJob(auth.userId, parsed.data.jobId, userClient) ?? detail;
                  } catch (e) {
                    logError("persist providerJobId failed", { error: (e as Error).message, jobId: detail.id });
                  }
                }
                progressPercent = poll.progressPercent ?? estimateProgressFromJob(detail.status, detail.created_at, requestedDuration);
              }
            } catch (e) {
              // Don't fail the request just because polling errored — return current state.
              logError("inline poll failed", {
                error: (e as Error).message,
                stack: (e as Error).stack,
                jobId: detail.id,
                provider: detail.provider_key,
              });
              progressPercent = estimateProgressFromJob(detail.status, detail.created_at, requestedDuration);
            }
          } else {
            progressPercent = estimateProgressFromJob(detail.status, detail.created_at, requestedDuration);
          }

          // Early-stuck guard: if the row sits in pending/processing without a
          // provider_job_id (so the inline poll above can never advance it),
          // fail with refund after ~60s. Without this, the only safety net is
          // the 15–45min stuck-timeout below — which looks to the user like
          // "the card never executed".
          if (
            !terminalFailedReason &&
            (detail.status === "processing" || detail.status === "pending") &&
            !detail.provider_job_id
          ) {
            const startedAt = Date.parse(detail.created_at);
            if (Number.isFinite(startedAt) && Date.now() - startedAt > 60_000) {
              terminalFailedReason = "Provider never returned a job id — credits refunded. Please try again.";
              try {
                await jobService.failJob(svc, {
                  userId: auth.userId,
                  jobId: detail.id,
                  reason: terminalFailedReason,
                  refundCredits: true,
                });
                detail = await jobService.getMyJob(auth.userId, parsed.data.jobId, userClient) ?? detail;
              } catch (e) {
                logError("null-providerJobId fail failed", { error: (e as Error).message, jobId: detail.id });
              }
              progressPercent = null;
            }
          }

          // Final safety net: if the job is still "processing" after the
          // hard timeout, force-fail with refund so the UI doesn't sit on a
          // forever-rendering card. Skips if we already flipped to terminal.
          if (
            !terminalFailedReason &&
            (detail.status === "processing" || detail.status === "pending")
          ) {
            const startedAt = Date.parse(detail.created_at);
            const stuckTimeoutMs = stuckTimeoutMsForDuration(requestedDuration);
            if (Number.isFinite(startedAt) && Date.now() - startedAt > stuckTimeoutMs) {
              const minutes = Math.round(stuckTimeoutMs / 60_000);
              terminalFailedReason = `Video provider did not return a result within ${minutes} minutes. Credits refunded — please try again.`;
              try {
                await jobService.failJob(svc, {
                  userId: auth.userId,
                  jobId: detail.id,
                  reason: terminalFailedReason,
                  refundCredits: true,
                });
                detail = await jobService.getMyJob(auth.userId, parsed.data.jobId, userClient) ?? detail;
              } catch (e) {
                logError("stuck-timeout fail failed", { error: (e as Error).message, jobId: detail.id });
              }
              progressPercent = null;
            }
          }

          const responseStatus = terminalFailedReason ? "failed" : detail.status;
          const responseDetail = terminalFailedReason
            ? { ...detail, status: "failed" as const }
            : detail;
          const statusMessage = terminalFailedReason
            ?? buildStatusMessage(responseStatus, detail.created_at, requestedDuration, false);

          await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt });
          return jsonResponse({
            ...responseDetail,
            progress_percent: progressPercent,
            status_message: statusMessage,
            requestId: ctx.requestId,
          });
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
              "firstFrameUrl must point to your own wan-frames upload",
              400,
              ctx.requestId,
            );
          }

          if (lastFrameUrl && !isAllowedFrameUrl(lastFrameUrl, auth.userId)) {
            await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 400, latencyMs: Date.now() - ctx.startedAt, errorCode: "INVALID_LAST_FRAME_URL" });
            return errorResponse(
              "INVALID_LAST_FRAME_URL",
              "lastFrameUrl must point to your own wan-frames upload",
              400,
              ctx.requestId,
            );
          }

          // Image-to-video accepts one or both frames; text-to-video provides
          // neither. No additional cross-frame validation needed here.

          // Veo (flow) renders 8s base clips; 10s/15s are now delivered by
          // chaining a Veo extension call inside the adapter (~15s total).
          // No up-front rejection needed — the adapter handles the chain.

          // Cross-domain call via external-api-adapter contract.
          // Pass duration + lastFrame so cost is accurate and Veo tier is
          // chosen correctly (Fast unless last-frame interpolation needed).
          const route = await aiGateway.resolveRoute(svc, providerKey, parsed.data.requestedModel, prompt, {
            durationSeconds: parsed.data.durationSeconds ?? 5,
            hasLastFrame: Boolean(lastFrameUrl),
          });

          // Convert USD cost to credits (1 credit = $0.01). Local models are
          // allowed to cost 0 because they run on the RTX box, not a cloud API.
          const costCredits = Math.max(0, Math.ceil(route.estimatedCost * 100));

          // Atomic: duplicate-guard + quota check + balance debit + create pending job.
          const chosenAspectRatio = parsed.data.aspectRatio ?? "16:9";
          let jobId: string;
          try {
            jobId = await jobService.createJob(svc, {
              userId: auth.userId,
              prompt,
              providerKey: route.providerKey,
              modelKey: route.resolvedModel,
              estimatedCost: costCredits,
              firstFrameUrl,
              lastFrameUrl,
              aspectRatio: chosenAspectRatio,
              durationSeconds: parsed.data.durationSeconds ?? null,
              draftGroupId: parsed.data.draftGroupId ?? null,
              narrationText: parsed.data.narrationText ?? null,
            });
          } catch (e) {
            const msg = (e as Error).message ?? "";
            logError("createJob failed", { error: msg });

            // Map RPC error tags → clean HTTP responses for the UI.
            if (msg.includes("duplicate_job")) {
              await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 409, latencyMs: Date.now() - ctx.startedAt, errorCode: "DUPLICATE_JOB" });
              return errorResponse("DUPLICATE_JOB", "An identical request was just submitted. Please wait a moment.", 409, ctx.requestId);
            }
            if (msg.includes("quota_exceeded_daily")) {
              await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 402, latencyMs: Date.now() - ctx.startedAt, errorCode: "QUOTA_DAILY" });
              return errorResponse("QUOTA_DAILY", "Daily generation budget reached. Try again tomorrow or ask an admin to raise your limit.", 402, ctx.requestId);
            }
            if (msg.includes("quota_exceeded_monthly")) {
              await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 402, latencyMs: Date.now() - ctx.startedAt, errorCode: "QUOTA_MONTHLY" });
              return errorResponse("QUOTA_MONTHLY", "Monthly generation budget reached. Ask an admin to raise your limit.", 402, ctx.requestId);
            }
            if (msg.includes("insufficient_credits")) {
              await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 402, latencyMs: Date.now() - ctx.startedAt, errorCode: "INSUFFICIENT_CREDITS" });
              return errorResponse("INSUFFICIENT_CREDITS", "Not enough credits for this generation. Top up to continue.", 402, ctx.requestId);
            }
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
            const genErr = (e as Error).message ?? "";
            // Refund credits + mark failed atomically.
            try {
              await jobService.failJob(svc, {
                userId: auth.userId,
                jobId,
                reason: genErr,
                refundCredits: true,
              });
            } catch (_) { /* best-effort */ }
            logError("startGeneration failed", { error: genErr, jobId });

            // Surface a precise, user-readable message when the Local router
            // isn't set up — instead of a generic provider error. Credits are
            // already refunded above. No secrets/URLs are leaked here.
            if (route.providerKey === "local" || /local video generation is not configured|LOCAL_VIDEO_BASE_URL/i.test(genErr)) {
              await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 503, latencyMs: Date.now() - ctx.startedAt, errorCode: "LOCAL_NOT_CONFIGURED" });
              return errorResponse(
                "LOCAL_NOT_CONFIGURED",
                "Local video generation is not configured yet. Configure the RTX video router or choose a cloud model.",
                503,
                ctx.requestId,
              );
            }

            return errorResponse("PROVIDER_ERROR", "The video provider could not start generation. Please try again.", 502, ctx.requestId);
          }

          // Guard: if the provider returned neither a job id we can poll nor a
          // complete result, the card would silently sit in `processing` until
          // the long stuck-timeout fires. Fail fast with a refund instead.
          if (!gen.providerJobId && !(gen.isComplete && gen.videoUrl)) {
            try {
              await jobService.failJob(svc, {
                userId: auth.userId,
                jobId,
                reason: "Provider did not return a job id",
                refundCredits: true,
              });
            } catch (_) { /* best-effort */ }
            logError("startGeneration returned no providerJobId", { jobId, provider: route.providerKey });
            return errorResponse("PROVIDER_ERROR", "The video provider did not return a job id. Credits refunded — please try again.", 502, ctx.requestId);
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
              const storagePath = await materializeVideoUrl(svc, auth.userId, gen.videoUrl);
              videoAssetId = await jobService.completeJob(svc, {
                userId: auth.userId,
                jobId,
                storagePath,
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
            const isNotFound = msg.toLowerCase().includes("not found");
            if (isNotFound) {
              // Idempotent: job already gone (e.g. double-click, stale UI).
              // Return success so the client clears the card cleanly.
              await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt });
              return jsonResponse({ ok: true, jobId: parsed.data.jobId, requestId: ctx.requestId });
            }
            logError("deleteJob failed", { error: msg, jobId: parsed.data.jobId });
            return errorResponse("DELETE_FAILED", "Could not delete job. Please try again.", 500, ctx.requestId);
          }

          // Best-effort: purge files from Storage. Group by bucket.
          // storage_path may be a full URL (external provider) or a
          // "<bucket>/<path>" string. We only delete from our own buckets.
          const KNOWN_BUCKETS = ["merged-videos", "wan-frames", "user-videos"];
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
