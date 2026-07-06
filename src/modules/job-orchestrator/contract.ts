// Job Orchestrator — frontend contract.
export interface JobSummary {
  id: string;
  status: string;
  input_prompt: string;
  narration_text?: string | null;
  provider_key: string | null;
  model_key: string | null;
  provider_job_id?: string | null;
  client_request_id?: string | null;
  provider_start_claimed_at?: string | null;
  provider_start_attempts?: number | null;
  provider_start_last_error?: string | null;
  first_frame_url?: string | null;
  last_frame_url?: string | null;
  /** Persistent Character Sheet reference image URL(s) anchored on this job. */
  reference_image_urls?: string[] | null;
  requested_duration?: number | null;
  requested_aspect_ratio?: string | null;
  /** Durable per-project group id; all clips in one draft project share it. */
  draft_group_id?: string | null;
  created_at: string;
  updated_at?: string;
  /** 0-100 estimated render progress; null when unknown/terminal-failed. */
  progress_percent?: number | null;
  /** Human-readable status line for the UI (e.g. "Queued", "Still rendering"). */
  status_message?: string | null;
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

export type AspectRatio = "9:16" | "1:1" | "16:9";

export interface CreateJobInput {
  providerKey: "wan" | "flow" | "local";
  requestedModel?: string;
  /** Stable idempotency key for safe timeout recovery; generated client-side per submit. */
  clientRequestId?: string;
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  /**
   * Optional persistent character/reference image URL(s) (e.g. a Character
   * Sheet). Sent in ADDITION to firstFrameUrl/lastFrameUrl to anchor identity
   * across chained cards. Providers that don't support reference images ignore it.
   */
  referenceImageUrls?: string[];
  /** Requested clip length in seconds. Defaults to 5 server-side. */
  durationSeconds?: 5 | 10 | 15;
  /** Requested output aspect ratio. Defaults to 16:9 server-side. */
  aspectRatio?: AspectRatio;
  /** Durable per-project group id so all clips in one session stay one draft. */
  draftGroupId?: string;
  /** Authoritative narration (spoken lines) from the scenario for this card. */
  narrationText?: string;
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
