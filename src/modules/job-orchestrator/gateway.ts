// Job-Orchestrator — frontend gateway (single grouped client for this domain).
//
// Public contract (v1):
//   - listMyJobs() -> JobSummary[]
//   - createJob(input) -> CreateJobResult
//   - getJob(jobId)    -> JobDetail
import { request } from "@/core/api/client";
import { ApiError } from "@/core/api/client";
import type { CreateJobInput, CreateJobResult, JobDetail, JobSummary } from "./contract";

export const JOB_ORCHESTRATOR_CONTRACT_VERSION = "v1" as const;

export const jobOrchestratorGateway = {
  contractVersion: JOB_ORCHESTRATOR_CONTRACT_VERSION,

  listMyJobs: async (): Promise<JobSummary[]> => {
    const r = await request<{ items: JobSummary[] }>("/jobs-list");
    return r.items ?? [];
  },

  createJob: async (input: CreateJobInput) => {
    const result = await request<CreateJobResult & { error?: { code?: string; message?: string }; status?: number }>("/jobs-create", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (result?.error?.code === "INSUFFICIENT_CREDITS") {
      throw new ApiError(result.status ?? 402, "INSUFFICIENT_CREDITS", result.error.message ?? "insufficient credits", result.requestId);
    }
    return result;
  },

  getJob: (jobId: string) =>
    request<JobDetail>(`/jobs-get?jobId=${encodeURIComponent(jobId)}`),

  deleteJob: (jobId: string) =>
    request<{ ok: true; jobId: string }>("/jobs-delete", {
      method: "POST",
      body: JSON.stringify({ jobId }),
    }),
};
