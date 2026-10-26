// Video Library — contract (read-only stub in Phase 2).
export interface VideoSummary {
  id: string;
  job_id: string;
  /** Owner of the video; differs from the viewer for shared (read-only) items. */
  user_id?: string;
  storage_path: string;
  thumbnail_url: string | null;
  aspect_ratio: string | null;
  duration: number | null;
  created_at: string;
}
