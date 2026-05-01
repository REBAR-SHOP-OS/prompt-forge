// Job-Orchestrator — frontend gateway (single grouped client for this domain).
//
// Public contract (v1):
//   - listMyJobs() -> JobSummary[]
//   - createJob(input) -> CreateJobResult
//   - getJob(jobId)    -> JobDetail
import { request } from "@/core/api/client";
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

  getJob: (jobId: string) =>
    request<JobDetail>(`/jobs-get?jobId=${encodeURIComponent(jobId)}`),
};
