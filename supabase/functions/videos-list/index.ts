// Edge surface for video-library.listMyVideos (v1).
import { corsHeaders } from "../_shared/core/http.ts";
import { videoLibraryGateway } from "../_shared/modules/video-library/gateway.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return videoLibraryGateway.handle(req, "listMyVideos");
});
