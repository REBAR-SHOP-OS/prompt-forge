// Video Library — service implementation (read-only in Phase 2).
import type { VideoLibraryService, VideoSummary } from "./contract.ts";
import { resolveVisibleOwnerIds } from "../../core/visible-owners.ts";

export const videoLibraryService: VideoLibraryService = {
  async listMyVideos(userId, client, limit = 20, includeShared = false) {
    const owners = includeShared ? await resolveVisibleOwnerIds(userId, client) : [userId];
    const { data, error } = await client
      .from("generator_video_assets")
      .select("id, job_id, user_id, storage_path, thumbnail_url, aspect_ratio, duration, created_at")
      .in("user_id", owners)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`videos lookup failed: ${error.message}`);
    return (data ?? []) as VideoSummary[];
  },
};
