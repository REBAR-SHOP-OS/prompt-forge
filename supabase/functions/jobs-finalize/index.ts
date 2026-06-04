// Edge surface: persist a Final Film server-side.
//
// Flow:
//   1. Authenticate the caller.
//   2. Validate { storagePath, aspectRatio?, durationSeconds?, clipCount?, sourceJobIds? }.
//   3. Call generator_finalize_film RPC (SECURITY DEFINER) which:
//        - creates a `final-film` job + video asset owned by the caller
//        - links source clip jobs via parent_final_job_id so they never
//          resurface as Drafts.
//   4. Return the resulting JobDetail so the client can drop it into the
//      "Final videos" list immediately.
import { corsHeaders, errorResponse, jsonResponse, readJsonBody } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";
import { jobService } from "../_shared/modules/job-orchestrator/service.ts";

interface FinalizeBody {
  storagePath: string;
  aspectRatio?: "16:9" | "1:1" | "9:16";
  durationSeconds?: number;
  clipCount?: number;
  sourceJobIds?: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validate(body: unknown): { ok: true; value: FinalizeBody } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "body must be an object" };
  const b = body as Record<string, unknown>;
  if (typeof b.storagePath !== "string" || b.storagePath.length === 0) {
    return { ok: false, message: "storagePath required" };
  }
  if (b.storagePath.length > 4096) return { ok: false, message: "storagePath too long" };
  const aspect = b.aspectRatio === "16:9" || b.aspectRatio === "1:1" || b.aspectRatio === "9:16"
    ? b.aspectRatio
    : undefined;
  let duration: number | undefined;
  if (b.durationSeconds !== undefined && b.durationSeconds !== null) {
    const n = Number(b.durationSeconds);
    if (Number.isFinite(n) && n >= 0 && n <= 3600) duration = Math.round(n);
  }
  let clipCount: number | undefined;
  if (b.clipCount !== undefined && b.clipCount !== null) {
    const n = Number(b.clipCount);
    if (Number.isFinite(n) && n >= 0 && n <= 1000) clipCount = Math.round(n);
  }
  let sourceJobIds: string[] | undefined;
  if (Array.isArray(b.sourceJobIds)) {
    sourceJobIds = b.sourceJobIds
      .filter((x): x is string => typeof x === "string" && UUID_RE.test(x))
      .slice(0, 1000);
  }
  return { ok: true, value: { storagePath: b.storagePath, aspectRatio: aspect, durationSeconds: duration, clipCount, sourceJobIds } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405);

  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const auth = await authenticate(req);
  if (!auth) return errorResponse("UNAUTHORIZED", "Missing or invalid token", 401, requestId);

  const body = await readJsonBody<unknown>(req, requestId);
  if (!body.ok) return body.response;
  const parsed = validate(body.value);
  if (!parsed.ok) return errorResponse("VALIDATION_ERROR", parsed.message, 400, requestId);

  const { storagePath, aspectRatio, durationSeconds, clipCount, sourceJobIds } = parsed.value;
  const svc = getServiceClient();
  try {
    const { data: jobId, error } = await svc.rpc("generator_finalize_film", {
      _user_id: auth.userId,
      _storage_path: storagePath,
      _aspect_ratio: aspectRatio ?? null,
      _duration: durationSeconds ?? null,
      _clip_count: clipCount ?? (sourceJobIds?.length ?? 0),
      _source_job_ids: sourceJobIds ?? [],
    });
    if (error) throw new Error(error.message);

    const detail = await jobService.getMyJob(auth.userId, jobId as string, svc);
    if (!detail) return errorResponse("NOT_FOUND", "Final film not found after create", 500, requestId);
    return jsonResponse({ ...detail, progress_percent: 100, requestId });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "jobs-finalize failed", error: (err as Error)?.message, requestId }));
    return errorResponse("INTERNAL_ERROR", "Could not save final film. Please try again.", 500, requestId);
  }
});
