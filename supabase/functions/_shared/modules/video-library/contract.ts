// Video Library — contract (read-only in Phase 2).
import type { SupabaseClient } from "../../core/supabase.ts";

export interface VideoSummary {
  id: string;
  job_id: string;
  storage_path: string;
  thumbnail_url: string | null;
  aspect_ratio: string | null;
  duration: number | null;
  created_at: string;
}

export interface VideoLibraryService {
  listMyVideos(userId: string, client: SupabaseClient, limit?: number): Promise<VideoSummary[]>;
}
