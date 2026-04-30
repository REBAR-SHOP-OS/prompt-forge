// Job Orchestrator — contract (read-only stub in Phase 2).
export interface JobSummary {
  id: string;
  status: string;
  input_prompt: string;
  provider_key: string | null;
  model_key: string | null;
  created_at: string;
}

export interface JobApi {
  listMyJobs(): Promise<JobSummary[]>;
}
