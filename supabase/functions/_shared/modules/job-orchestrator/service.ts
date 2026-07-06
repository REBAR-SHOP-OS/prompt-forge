// Job Orchestrator — service implementation.
import type { SupabaseClient } from "../../core/supabase.ts";
import type { CreateJobInput, JobDetail, JobService, JobSummary } from "./contract.ts";

const JOB_COLUMNS =
  "id, status, input_prompt, narration_text, provider_key, model_key, provider_job_id, client_request_id, provider_start_claimed_at, provider_start_attempts, provider_start_last_error, first_frame_url, last_frame_url, reference_image_urls, requested_duration, requested_aspect_ratio, draft_group_id, created_at, updated_at";

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
    const { data, error } = await svc.rpc("generator_start_job_v2", {
      _user_id: input.userId,
      _prompt: input.prompt,
      _provider_key: input.providerKey,
      _model_key: input.modelKey,
      _cost: Math.max(0, Math.ceil(input.estimatedCost || 0)),
      _client_request_id: input.clientRequestId ?? null,
      _first_frame_url: input.firstFrameUrl ?? null,
      _last_frame_url: input.lastFrameUrl ?? null,
      _reference_image_urls: input.referenceImageUrls && input.referenceImageUrls.length > 0 ? input.referenceImageUrls : null,
      _requested_aspect_ratio: input.aspectRatio ?? null,
      _requested_duration: input.durationSeconds ?? null,
      _draft_group_id: input.draftGroupId ?? null,
      _narration_text: input.narrationText ?? null,
    });
    if (error) throw new Error(error.message);
    return data as string;
  },

  async claimProviderStart(svc, userId, jobId, staleAfterSeconds = 120) {
    const { data, error } = await svc.rpc("generator_claim_provider_start", {
      _user_id: userId,
      _job_id: jobId,
      _stale_after_seconds: staleAfterSeconds,
    });
    if (error) throw new Error(error.message);
    return Boolean(data);
  },

  async recordProviderStartError(svc, userId, jobId, reason) {
    const { error } = await svc.rpc("generator_record_provider_start_error", {
      _user_id: userId,
      _job_id: jobId,
      _reason: reason,
    });
    if (error) throw new Error(error.message);
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
