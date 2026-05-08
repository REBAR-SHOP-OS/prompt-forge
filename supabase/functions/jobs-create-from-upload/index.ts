// Edge surface: create a job + asset row from a user-uploaded video file.
//
// Flow:
//   1. Authenticate the caller.
//   2. Validate the inbound { storagePath, durationSeconds, aspectRatio, prompt }.
//   3. Call generator_start_job (provider 'upload') to materialize a job row.
//   4. Call generator_complete_job to attach the video asset and flip status.
//   5. Return the resulting JobDetail so the client can drop it straight into state.
import { corsHeaders, errorResponse, jsonResponse, readJsonBody } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";
import { jobService } from "../_shared/modules/job-orchestrator/service.ts";

interface UploadJobBody {
  storagePath: string;
  durationSeconds?: number;
  aspectRatio?: "16:9" | "1:1" | "9:16";
  prompt?: string;
}

function validate(body: unknown): { ok: true; value: UploadJobBody } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "body must be an object" };
  const b = body as Record<string, unknown>;
  if (typeof b.storagePath !== "string" || b.storagePath.length === 0) {
    return { ok: false, message: "storagePath required" };
  }
  if (b.storagePath.length > 2048) {
    return { ok: false, message: "storagePath too long" };
  }
  const aspect = b.aspectRatio === "16:9" || b.aspectRatio === "1:1" || b.aspectRatio === "9:16"
    ? b.aspectRatio
    : undefined;
  let duration: number | undefined;
  if (b.durationSeconds !== undefined) {
    const n = Number(b.durationSeconds);
    if (!Number.isFinite(n) || n < 1 || n > 600) {
      return { ok: false, message: "durationSeconds must be 1-600" };
    }
    duration = Math.round(n);
  }
  const prompt = typeof b.prompt === "string" && b.prompt.trim().length > 0
    ? b.prompt.trim().slice(0, 500)
    : "Uploaded video";
  return { ok: true, value: { storagePath: b.storagePath, durationSeconds: duration, aspectRatio: aspect, prompt } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405);
  }

  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const auth = await authenticate(req);
  if (!auth) return errorResponse("UNAUTHORIZED", "Missing or invalid token", 401, requestId);

  const body = await readJsonBody<unknown>(req, requestId);
  if (!body.ok) return body.response;
  const parsed = validate(body.value);
  if (!parsed.ok) return errorResponse("VALIDATION_ERROR", parsed.message, 400, requestId);

  const { storagePath, durationSeconds, aspectRatio, prompt } = parsed.value;

  const svc = getServiceClient();
  try {
    // 1) Create a job row owned by the caller (cost = 0 — no provider call).
    const jobId = await jobService.createJob(svc, {
      userId: auth.userId,
      prompt: prompt ?? "Uploaded video",
      providerKey: "upload",
      modelKey: "user-upload",
      estimatedCost: 0,
      aspectRatio,
      durationSeconds: durationSeconds as 5 | 10 | 15 | undefined,
    });

    // 2) Attach the asset and flip status to completed.
    await jobService.completeJob(svc, {
      userId: auth.userId,
      jobId,
      storagePath,
      thumbnailUrl: null,
      aspectRatio: aspectRatio ?? null,
      duration: durationSeconds ?? null,
    });

    // 3) Return the fresh JobDetail (use the service client — RPCs are SECURITY DEFINER
    //    and the row is owned by the caller so this round-trip is safe).
    const detail = await jobService.getMyJob(auth.userId, jobId, svc);
    if (!detail) return errorResponse("NOT_FOUND", "Job not found after create", 500, requestId);

    return jsonResponse({ ...detail, progress_percent: 100, requestId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return errorResponse("INTERNAL_ERROR", message, 500, requestId);
  }
});
