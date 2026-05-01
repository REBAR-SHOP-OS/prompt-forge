// Video-Library — frontend gateway (single grouped client for this domain).
//
// Public contract (v1, read-only stub in Phase 3 — no edge endpoint yet).
import type { VideoSummary } from "./contract";

export const VIDEO_LIBRARY_CONTRACT_VERSION = "v1" as const;

export const videoLibraryGateway = {
  contractVersion: VIDEO_LIBRARY_CONTRACT_VERSION,
  listMyVideos: async (): Promise<VideoSummary[]> => [],
};
