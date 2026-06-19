// Edge function: poll an MP4 export job.
// Validates JWT + ownership, returns status and (when completed) a signed MP4 URL.
import { corsHeaders, errorResponse, jsonResponse, readJsonBody } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";

const SIGNED_TTL = 60 * 60; // 1h

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405);

  const auth = await authenticate(req);
  if (!auth) return errorResponse("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await readJsonBody<{ jobId?: unknown }>(req);
  if (!parsed.ok) return parsed.response;
  const jobId = typeof parsed.value.jobId === "string" ? parsed.value.jobId : "";
  if (!jobId) return errorResponse("BAD_REQUEST", "jobId required", 400);

  const svc = getServiceClient();
  const { data: job, error } = await svc
    .from("mp4_export_jobs")
    .select("id, user_id, output_path, status, error")
    .eq("id", jobId)
    .eq("user_id", auth.userId)
    .single();
  if (error || !job) return errorResponse("NOT_FOUND", "Job not found", 404);

  if (job.status === "completed" && job.output_path) {
    const { data, error: signErr } = await svc.storage
      .from("mp4-exports")
      .createSignedUrl(job.output_path as string, SIGNED_TTL);
    if (signErr || !data?.signedUrl) {
      return jsonResponse({ status: "failed", error: "Export file unavailable" });
    }
    return jsonResponse({ status: "completed", url: data.signedUrl, bucket: "mp4-exports", path: job.output_path });
  }

  if (job.status === "failed") {
    return jsonResponse({ status: "failed", error: job.error || "MP4 export failed" });
  }

  return jsonResponse({ status: job.status });
});
