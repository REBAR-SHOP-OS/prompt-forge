// Edge surface: replace the video asset of an existing job with an edited file.
//
// Used after the user trims a clip in the browser and we upload the result.
// Soft-deletes the current asset(s) for the job and inserts a new one
// pointing at the edited file. Returns the fresh JobDetail so the client
// can drop it straight into state.
import { corsHeaders, errorResponse, jsonResponse, readJsonBody } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";
import { jobService } from "../_shared/modules/job-orchestrator/service.ts";

interface Body {
  jobId: string;
  storagePath: string;
  durationSeconds?: number;
  aspectRatio?: "16:9" | "1:1" | "9:16" | string;
}

function validate(body: unknown): { ok: true; value: Body } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "body must be an object" };
  const b = body as Record<string, unknown>;
  if (typeof b.jobId !== "string" || b.jobId.length === 0) return { ok: false, message: "jobId required" };
  if (typeof b.storagePath !== "string" || b.storagePath.length === 0) {
    return { ok: false, message: "storagePath required" };
  }
  if (b.storagePath.length > 2048) return { ok: false, message: "storagePath too long" };
  let duration: number | undefined;
  if (b.durationSeconds !== undefined) {
    const n = Number(b.durationSeconds);
    if (!Number.isFinite(n) || n < 1 || n > 3600) return { ok: false, message: "durationSeconds invalid" };
    duration = Math.round(n);
  }
  const aspectRatio = typeof b.aspectRatio === "string" ? b.aspectRatio : undefined;
  return { ok: true, value: { jobId: b.jobId, storagePath: b.storagePath, durationSeconds: duration, aspectRatio } };
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

  const { jobId, storagePath, durationSeconds, aspectRatio } = parsed.value;
  const svc = getServiceClient();

  try {
    // Confirm caller owns the job.
    const { data: job, error: jobErr } = await svc
      .from("generator_generation_jobs")
      .select("id, user_id, deleted_at")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr) throw new Error(jobErr.message);
    if (!job || job.user_id !== auth.userId || job.deleted_at) {
      return errorResponse("NOT_FOUND", "Job not found", 404, requestId);
    }

    // Soft-delete previous live asset(s) for this job.
    const { error: delErr } = await svc
      .from("generator_video_assets")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("job_id", jobId)
      .eq("user_id", auth.userId)
      .is("deleted_at", null);
    if (delErr) throw new Error(`asset soft-delete failed: ${delErr.message}`);

    // Insert the edited asset.
    const { error: insErr } = await svc
      .from("generator_video_assets")
      .insert({
        user_id: auth.userId,
        job_id: jobId,
        storage_path: storagePath,
        thumbnail_url: null,
        aspect_ratio: aspectRatio ?? null,
        duration: durationSeconds ?? null,
      });
    if (insErr) throw new Error(`asset insert failed: ${insErr.message}`);

    // Make sure the job is marked completed (in case it wasn't).
    await svc
      .from("generator_generation_jobs")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", auth.userId);

    const detail = await jobService.getMyJob(auth.userId, jobId, svc);
    if (!detail) return errorResponse("NOT_FOUND", "Job not found after update", 500, requestId);
    return jsonResponse({ ...detail, progress_percent: 100, requestId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return errorResponse("INTERNAL_ERROR", message, 500, requestId);
  }
});
