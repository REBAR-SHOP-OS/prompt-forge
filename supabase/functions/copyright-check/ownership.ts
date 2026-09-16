import type { SupabaseClient } from "../_shared/core/supabase.ts";

export async function ownsGenerationJob(client: SupabaseClient, userId: string, jobId: string): Promise<boolean> {
  const { data, error } = await client
    .from("generator_generation_jobs")
    .select("id")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`job ownership lookup failed: ${error.message ?? "unknown"}`);
  return data?.id === jobId;
}
