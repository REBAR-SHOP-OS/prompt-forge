// Job Orchestrator — contract.
import type { SupabaseClient } from "../../core/supabase.ts";

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
}

export interface JobService {
  listMyJobs(userId: string, client: SupabaseClient, limit?: number): Promise<JobSummary[]>;
  getMyJob(userId: string, jobId: string, client: SupabaseClient): Promise<JobDetail | null>;
  createJob(svc: SupabaseClient, input: CreateJobInput): Promise<string>;
  markProcessing(svc: SupabaseClient, userId: string, jobId: string, providerJobId: string | null): Promise<void>;
  completeJob(svc: SupabaseClient, params: {
    userId: string;
    jobId: string;
    storagePath: string;
    thumbnailUrl: string | null;
    aspectRatio: string | null;
    duration: number | null;
  }): Promise<string>;
}
