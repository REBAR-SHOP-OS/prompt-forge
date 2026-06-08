// Job Orchestrator — service implementation.
import type { SupabaseClient } from "../../core/supabase.ts";
import type { CreateJobInput, JobDetail, JobService, JobSummary } from "./contract.ts";

const JOB_COLUMNS =
  "id, status, input_prompt, provider_key, model_key, provider_job_id, first_frame_url, last_frame_url, requested_duration, requested_aspect_ratio, created_at, updated_at";

export const jobService: JobService = {
  async listMyJobs(userId, client, limit = 20) {
    const { data, error } = await client
      .from("generator_generation_jobs")
      .select(JOB_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`jobs lookup failed: ${error.message}`);
    return (data ?? []) as JobSummary[];
  },

  async getMyJob(userId, jobId, client) {
    const { data, error } = await client
      .from("generator_generation_jobs")
      .select(JOB_COLUMNS)
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
      _cost: Math.max(0, Math.ceil(input.estimatedCost || 0)),
    });
    if (error) throw new Error(error.message);
    const jobId = data as string;

    // Persist optional first/last frame URLs and the user's requested
    // aspect ratio / duration on the job row (not part of the credit RPC).
    const updates: Record<string, unknown> = {};
    if (input.firstFrameUrl !== undefined) updates.first_frame_url = input.firstFrameUrl ?? null;
    if (input.lastFrameUrl !== undefined) updates.last_frame_url = input.lastFrameUrl ?? null;
    if (input.aspectRatio) updates.requested_aspect_ratio = input.aspectRatio;
    if (input.durationSeconds) updates.requested_duration = input.durationSeconds;
    if (Object.keys(updates).length > 0) {
      const { error: updErr } = await svc
        .from("generator_generation_jobs")
        .update(updates)
        .eq("id", jobId)
        .eq("user_id", input.userId);
      if (updErr) throw new Error(`job metadata persist failed: ${updErr.message}`);
    }
    return jobId;
  },

  async markProcessing(svc, userId, jobId, providerJobId) {
    const { error } = await svc.rpc("generator_mark_job_processing", {
      _user_id: userId,
      _job_id: jobId,
      _provider_job_id: providerJobId,
    });
    if (error) throw new Error(error.message);
  },

  async failJob(svc, params) {
    const { error } = await svc.rpc("generator_fail_job", {
      _user_id: params.userId,
      _job_id: params.jobId,
      _reason: params.reason ?? null,
      _refund: params.refundCredits ?? true,
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

  async deleteJob(svc, userId, jobId) {
    const { data, error } = await svc.rpc("generator_delete_job", {
      _user_id: userId,
      _job_id: jobId,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<{ storage_path: string }>)
      .map((r) => r.storage_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
  },
};
