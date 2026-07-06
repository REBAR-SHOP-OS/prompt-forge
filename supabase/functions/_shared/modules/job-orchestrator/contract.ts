// Job Orchestrator — contract.
import type { SupabaseClient } from "../../core/supabase.ts";

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
  reference_image_urls?: string[] | null;
  requested_duration?: number | null;
  requested_aspect_ratio?: string | null;
  draft_group_id?: string | null;
  created_at: string;
  updated_at?: string;
  /** 0-100 estimated render progress; null when unknown/terminal-failed. */
  progress_percent?: number | null;
  /** Human-readable status line for the UI (e.g. "Queued", "Still rendering"). */
  status_message?: string | null;
}

export interface JobDetail extends JobSummary {
  video?: {
    id: string;
    storage_path: string;
    thumbnail_url: string | null;
    aspect_ratio: string | null;
    duration: number | null;
  } | null;
}

export interface CreateJobInput {
  userId: string;
  prompt: string;
  providerKey: string;
  modelKey: string;
  estimatedCost: number;
  clientRequestId?: string | null;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  /** Optional persistent character/reference image URL(s) for identity anchoring. */
  referenceImageUrls?: string[] | null;
  aspectRatio?: "9:16" | "1:1" | "16:9" | null;
  durationSeconds?: 5 | 10 | 15 | null;
  draftGroupId?: string | null;
  narrationText?: string | null;
}

export interface JobService {
  listMyJobs(userId: string, client: SupabaseClient, limit?: number): Promise<JobSummary[]>;
  getMyJob(userId: string, jobId: string, client: SupabaseClient): Promise<JobDetail | null>;
  createJob(svc: SupabaseClient, input: CreateJobInput): Promise<string>;
  claimProviderStart(svc: SupabaseClient, userId: string, jobId: string, staleAfterSeconds?: number): Promise<boolean>;
  recordProviderStartError(svc: SupabaseClient, userId: string, jobId: string, reason: string): Promise<void>;
  markProcessing(svc: SupabaseClient, userId: string, jobId: string, providerJobId: string | null): Promise<void>;
  failJob(svc: SupabaseClient, params: {
    userId: string;
    jobId: string;
    reason?: string | null;
    refundCredits?: boolean;
  }): Promise<void>;
  completeJob(svc: SupabaseClient, params: {
    userId: string;
    jobId: string;
    storagePath: string;
    thumbnailUrl: string | null;
    aspectRatio: string | null;
    duration: number | null;
  }): Promise<string>;
  deleteJob(svc: SupabaseClient, userId: string, jobId: string): Promise<string[]>;
}
