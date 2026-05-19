// Job-Orchestrator — frontend gateway (single grouped client for this domain).
//
// Public contract (v1):
//   - listMyJobs() -> JobSummary[]
//   - createJob(input) -> CreateJobResult
//   - getJob(jobId)    -> JobDetail
import { ApiError, request } from "@/core/api/client";
import type { CreateJobInput, CreateJobResult, JobDetail, JobSummary } from "./contract";

export const JOB_ORCHESTRATOR_CONTRACT_VERSION = "v1" as const;

export const jobOrchestratorGateway = {
  contractVersion: JOB_ORCHESTRATOR_CONTRACT_VERSION,

  listMyJobs: async (): Promise<JobSummary[]> => {
    const r = await request<{ items: JobSummary[] }>("/jobs-list");
    return r.items ?? [];
  },

  createJob: (input: CreateJobInput) =>
    request<CreateJobResult>("/jobs-create", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getJob: async (jobId: string) => {
    const result = await request<JobDetail | { error?: { code?: string; message?: string }; missing?: boolean; requestId?: string }>(
      `/jobs-get?jobId=${encodeURIComponent(jobId)}`,
    );
    if ('missing' in result && result.missing) {
      throw new ApiError(404, result.error?.code ?? 'NOT_FOUND', result.error?.message ?? 'Job not found', result.requestId);
    }
    return result as JobDetail;
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
