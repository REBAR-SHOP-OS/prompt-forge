// Job Orchestrator — frontend contract.
export interface JobSummary {
  id: string;
  status: string;
  input_prompt: string;
  provider_key: string | null;
  model_key: string | null;
  provider_job_id?: string | null;
  first_frame_url?: string | null;
  last_frame_url?: string | null;
  created_at: string;
  updated_at?: string;
  /** 0-100 estimated render progress; null when unknown/terminal-failed. */
  progress_percent?: number | null;
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
  providerKey: "wan";
  requestedModel?: string;
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
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
