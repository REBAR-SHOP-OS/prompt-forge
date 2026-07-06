// Job-Orchestrator — frontend gateway (single grouped client for this domain).
//
// Public contract (v1):
//   - listMyJobs() -> JobSummary[]
//   - createJob(input) -> CreateJobResult
//   - getJob(jobId)    -> JobDetail
import { ApiError, request } from "@/core/api/client";
import type { CreateJobInput, CreateJobResult, JobDetail, JobSummary } from "./contract";

export const JOB_ORCHESTRATOR_CONTRACT_VERSION = "v1" as const;

// In-flight de-dupe: if multiple callers ask for the same Job at the same
// time (e.g. polling loop + preview re-render), share one network request.
// This prevents the backend from running the inline DashScope poll twice
// per tick and avoids contradictory snapshots in the UI.
const inflightGetJob = new Map<string, Promise<JobDetail>>();

function withClientRequestId(input: CreateJobInput): CreateJobInput {
  return {
    ...input,
    clientRequestId: input.clientRequestId ?? crypto.randomUUID(),
  };
}

function isCreateTimeout(error: unknown): boolean {
  return error instanceof ApiError && error.code === "TIMEOUT";
}

function recoveredCreateResult(job: JobSummary): CreateJobResult | null {
  const status = job.status === "pending" || job.status === "processing" || job.status === "completed"
    ? job.status
    : null;
  if (!status || !job.provider_key || !job.model_key) return null;
  return {
    jobId: job.id,
    status,
    videoAssetId: null,
    providerKey: job.provider_key,
    resolvedModel: job.model_key,
    requestId: "recovered-after-timeout",
  };
}

async function recoverCreateTimeout(input: CreateJobInput): Promise<CreateJobResult | null> {
  if (!input.clientRequestId) return null;
  const response = await request<{ items: JobSummary[] }>("/jobs-list?limit=50", { timeoutMs: 30_000 });
  const recovered = (response.items ?? []).find((job) => job.client_request_id === input.clientRequestId);
  return recovered ? recoveredCreateResult(recovered) : null;
}

export const jobOrchestratorGateway = {
  contractVersion: JOB_ORCHESTRATOR_CONTRACT_VERSION,

  listMyJobs: async (limit?: number): Promise<JobSummary[]> => {
    const qs = limit ? `?limit=${encodeURIComponent(limit)}` : "";
    const r = await request<{ items: JobSummary[] }>(`/jobs-list${qs}`);
    return r.items ?? [];
  },

  createJob: async (input: CreateJobInput) => {
    const idempotentInput = withClientRequestId(input);
    const options = {
      method: "POST",
      body: JSON.stringify(idempotentInput),
      // jobs-create returns once the durable Pending job exists and provider
      // handoff is recorded. Give cold starts/DB handshakes enough room while
      // still preventing the composer from hanging forever.
      timeoutMs: 120_000,
    };
    try {
      return await request<CreateJobResult>("/jobs-create", options);
    } catch (error) {
      if (!isCreateTimeout(error)) throw error;
      // The first request may have reached the backend but timed out before the
      // response returned. Retry once with the same clientRequestId; the backend
      // returns the already-created job without charging or dispatching twice.
      try {
        return await request<CreateJobResult>("/jobs-create", options);
      } catch (retryError) {
        if (!isCreateTimeout(retryError)) throw retryError;
        const recovered = await recoverCreateTimeout(idempotentInput);
        if (recovered) return recovered;
        throw retryError;
      }
    }
  },

  getJob: (jobId: string): Promise<JobDetail> => {
    const existing = inflightGetJob.get(jobId);
    if (existing) return existing;
    const promise = (async () => {
      const result = await request<JobDetail | { error?: { code?: string; message?: string }; missing?: boolean; requestId?: string }>(
        `/jobs-get?jobId=${encodeURIComponent(jobId)}`,
        // A poll should never hang forever; the caller's failure/backoff logic
        // retries on a thrown error, so a stuck poll self-heals.
        { timeoutMs: 90_000 },
      );
      if ('missing' in result && result.missing) {
        throw new ApiError(404, result.error?.code ?? 'NOT_FOUND', result.error?.message ?? 'Job not found', result.requestId);
      }
      return result as JobDetail;
    })().finally(() => {
      inflightGetJob.delete(jobId);
    });
    inflightGetJob.set(jobId, promise);
    return promise;
  },

  deleteJob: (jobId: string) =>
    request<{ ok: true; jobId: string }>("/jobs-delete", {
      method: "POST",
      body: JSON.stringify({ jobId }),
    }),

  /**
   * Create a real, server-persisted video card from a file the user uploaded
   * directly (no provider call). Mirrors the shape returned by getJob so the
   * caller can drop the result straight into the History list.
   */
  createUploadedVideoJob: (input: {
    storagePath: string;
    durationSeconds?: number;
    aspectRatio?: "16:9" | "1:1" | "9:16";
    prompt?: string;
  }) =>
    request<JobDetail>("/jobs-create-from-upload", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /**
   * Replace the video asset of an existing job (e.g. after Apply Changes
   * in the trim dialog). Returns the fresh JobDetail.
   */
  updateEditedVideo: (input: {
    jobId: string;
    storagePath: string;
    durationSeconds?: number;
    aspectRatio?: string;
  }) =>
    request<JobDetail>("/jobs-update-edited-video", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
