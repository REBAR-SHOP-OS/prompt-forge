// Video Library — service implementation (read-only in Phase 2).
import type { SupabaseClient } from "../../core/supabase.ts";
import type { VideoLibraryService, VideoSummary } from "./contract.ts";

export const videoLibraryService: VideoLibraryService = {
  async listMyVideos(userId, client, limit = 20) {
    const { data, error } = await client
      .from("generator_video_assets")
      .select("id, job_id, storage_path, thumbnail_url, aspect_ratio, duration, created_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`videos lookup failed: ${error.message}`);
    return (data ?? []) as VideoSummary[];
  },
};
