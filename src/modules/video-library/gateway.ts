// Video-Library — frontend gateway (single grouped client for this domain).
//
// Public contract (v1):
//   - listMyVideos() -> VideoSummary[]
import { request } from "@/core/api/client";
import type { VideoSummary } from "./contract";

const VIDEO_LIBRARY_CONTRACT_VERSION = "v1" as const;

export const videoLibraryGateway = {
  contractVersion: VIDEO_LIBRARY_CONTRACT_VERSION,

  /** includeShared also returns read-only videos from owners who shared their library with you. */
  listMyVideos: async (limit?: number, includeShared = false): Promise<VideoSummary[]> => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (includeShared) params.set("shared", "1");
    const qs = params.toString() ? `?${params}` : "";
    const r = await request<{ items: VideoSummary[] }>(`/videos-list${qs}`);
    return r.items ?? [];
  },
};
