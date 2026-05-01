// Job Orchestrator — service implementation.
import type { SupabaseClient } from "../../core/supabase.ts";
import type { CreateJobInput, JobDetail, JobService, JobSummary } from "./contract.ts";

export const jobService: JobService = {
  async listMyJobs(userId, client, limit = 20) {
    const { data, error } = await client
      .from("generator_generation_jobs")
      .select("id, status, input_prompt, provider_key, model_key, provider_job_id, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`jobs lookup failed: ${error.message}`);
    return (data ?? []) as JobSummary[];
  },

  async getMyJob(userId, jobId, client) {
    const { data, error } = await client
      .from("generator_generation_jobs")
      .select("id, status, input_prompt, provider_key, model_key, provider_job_id, created_at, updated_at")
      .eq("user_id", userId)
      .eq("id", jobId)
      .maybeSingle();
    if (error) throw new Error(`job lookup failed: ${error.message}`);
    if (!data) return null;

    const { data: video } = await client
      .from("generator_video_assets")
      .select("id, storage_path, thumbnail_url, aspect_ratio, duration")
      .eq("job_id", jobId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    return { ...data, video: video ?? null } as JobDetail;
  },

  async createJob(svc, input: CreateJobInput): Promise<string> {
    const { data, error } = await svc.rpc("generator_start_job", {
      _user_id: input.userId,
      _prompt: input.prompt,
      _provider_key: input.providerKey,
      _model_key: input.modelKey,
      _cost: Math.max(1, Math.ceil(input.estimatedCost || 1)),
    });
    if (error) throw new Error(error.message);
    return data as string;
  },

  async markProcessing(svc, userId, jobId, providerJobId) {
    const { error } = await svc.rpc("generator_mark_job_processing", {
      _user_id: userId,
      _job_id: jobId,
      _provider_job_id: providerJobId,
    });
    if (error) throw new Error(error.message);
  },

  async completeJob(svc, params) {
    const { data, error } = await svc.rpc("generator_complete_job", {
      _user_id: params.userId,
      _job_id: params.jobId,
      _storage_path: params.storagePath,
      _thumbnail_url: params.thumbnailUrl,
      _aspect_ratio: params.aspectRatio,
      _duration: params.duration,
    });
    if (error) throw new Error(error.message);
    return data as string;
  },
};
