// Job Orchestrator — contract (read-only in Phase 2).
import type { SupabaseClient } from "../../core/supabase.ts";

export interface JobSummary {
  id: string;
  status: string;
  input_prompt: string;
  provider_key: string | null;
  model_key: string | null;
  created_at: string;
}

export interface JobService {
  listMyJobs(userId: string, client: SupabaseClient, limit?: number): Promise<JobSummary[]>;
}
