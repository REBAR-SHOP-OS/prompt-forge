// Job Orchestrator — service implementation (read-only in Phase 2).
import type { SupabaseClient } from "../../core/supabase.ts";
import type { JobService, JobSummary } from "./contract.ts";

export const jobService: JobService = {
  async listMyJobs(userId, client, limit = 20) {
    const { data, error } = await client
      .from("generator_generation_jobs")
      .select("id, status, input_prompt, provider_key, model_key, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`jobs lookup failed: ${error.message}`);
    return (data ?? []) as JobSummary[];
  },
};
