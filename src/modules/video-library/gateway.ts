// Video-Library — frontend gateway (single grouped client for this domain).
//
// Public contract (v1):
//   - listMyVideos() -> VideoSummary[]
import { request } from "@/core/api/client";
import type { VideoSummary } from "./contract";

export const VIDEO_LIBRARY_CONTRACT_VERSION = "v1" as const;

export const videoLibraryGateway = {
  contractVersion: VIDEO_LIBRARY_CONTRACT_VERSION,

  listMyVideos: async (): Promise<VideoSummary[]> => {
    const r = await request<{ items: VideoSummary[] }>("/videos-list");
    return r.items ?? [];
  },
};
