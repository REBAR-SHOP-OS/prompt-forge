// Edge surface for video-library.listMyVideos (v1).
import { preflightResponse } from "../_shared/core/http.ts";
import { videoLibraryGateway } from "../_shared/modules/video-library/gateway.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return preflightResponse(req);
  return videoLibraryGateway.handle(req, "listMyVideos");
});
