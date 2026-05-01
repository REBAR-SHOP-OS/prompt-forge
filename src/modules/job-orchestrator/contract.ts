// Job Orchestrator — frontend contract.
export interface JobSummary {
  id: string;
  status: string;
  input_prompt: string;
  provider_key: string | null;
  model_key: string | null;
  provider_job_id?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface JobVideo {
  id: string;
  storage_path: string;
  thumbnail_url: string | null;
  aspect_ratio: string | null;
  duration: number | null;
}

export interface JobDetail extends JobSummary {
  video: JobVideo | null;
  requestId?: string;
}

export interface CreateJobInput {
  providerKey: "flow" | "wan";
  requestedModel?: string;
  prompt: string;
}

export interface CreateJobResult {
  jobId: string;
  status: "pending" | "processing" | "completed";
  videoAssetId: string | null;
  providerKey: string;
  resolvedModel: string;
  requestId: string;
}

export interface JobApi {
  listMyJobs(): Promise<JobSummary[]>;
  createJob(input: CreateJobInput): Promise<CreateJobResult>;
  getJob(jobId: string): Promise<JobDetail>;
}
