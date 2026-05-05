// Video-Library — domain gateway (single public ingress for this domain).
//
// Public contract (v1, read-only in Phase 3):
//   - listMyVideos() -> VideoSummary[]
//
// No edge endpoint wired yet; gateway exists so future ingress is centralized.

import { errorResponse, jsonResponse, startRequest } from "../../core/http.ts";
import { authenticate } from "../../core/auth.ts";
import { getServiceClient, getUserScopedClient } from "../../core/supabase.ts";
import { logError, writeApiRequestLog } from "../../core/observability.ts";
import { videoLibraryService } from "./service.ts";
import type { DomainContractMeta } from "../_gateway/types.ts";

export const VIDEO_LIBRARY_CONTRACT: DomainContractMeta = {
  domain: "video-library",
  version: "v1",
  operations: ["listMyVideos"],
} as const;

export const videoLibraryGateway = {
  contract: VIDEO_LIBRARY_CONTRACT,

  async handle(req: Request, operation: string): Promise<Response> {
    const ctx = startRequest(req, `/${VIDEO_LIBRARY_CONTRACT.domain}/${operation}`);
    const svc = getServiceClient();
    try {
      const auth = await authenticate(req);
      if (!auth) {
        await writeApiRequestLog(svc, { ...ctx, statusCode: 401, latencyMs: Date.now() - ctx.startedAt, errorCode: "UNAUTHORIZED" });
        return errorResponse("UNAUTHORIZED", "Missing or invalid token", 401, ctx.requestId);
      }
      switch (operation) {
        case "listMyVideos": {
          const userClient = getUserScopedClient(auth.authHeader);
          const items = await videoLibraryService.listMyVideos(auth.userId, userClient);
          await writeApiRequestLog(svc, { ...ctx, userId: auth.userId, statusCode: 200, latencyMs: Date.now() - ctx.startedAt });
          return jsonResponse({ items, requestId: ctx.requestId });
        }
        default:
          return errorResponse("UNKNOWN_OPERATION", `Unknown operation: ${operation}`, 404, ctx.requestId);
      }
    } catch (e) {
      logError("video-library gateway unhandled", { error: (e as Error).message, operation });
      await writeApiRequestLog(svc, { ...ctx, statusCode: 500, latencyMs: Date.now() - ctx.startedAt, errorCode: "INTERNAL" });
      return errorResponse("INTERNAL", "Internal error", 500, ctx.requestId);
    }
  },
};
