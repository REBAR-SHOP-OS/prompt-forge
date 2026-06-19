// Edge function: request a server-side MP4 export.
// Validates JWT + ownership, short-circuits when the source is already MP4 or a
// cached export exists, otherwise creates a job and kicks off the worker.
// Never returns/produces WebM.
import { corsHeaders, errorResponse, jsonResponse, readJsonBody } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";
import { getEnv } from "../_shared/core/env.ts";

const ALLOWED_BUCKETS = new Set(["user-videos", "merged-videos"]);
const SIGNED_TTL = 60 * 60; // 1h

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405);

  const auth = await authenticate(req);
  if (!auth) return errorResponse("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await readJsonBody<{ bucket?: unknown; storagePath?: unknown }>(req);
  if (!parsed.ok) return parsed.response;
  const bucket = typeof parsed.value.bucket === "string" ? parsed.value.bucket : "";
  const storagePath = typeof parsed.value.storagePath === "string" ? parsed.value.storagePath : "";

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return errorResponse("INVALID_BUCKET", "Unsupported source bucket", 400);
  }
  if (!storagePath || storagePath.includes("..")) {
    return errorResponse("INVALID_PATH", "Invalid storage path", 400);
  }
  // Ownership: every stored file lives under `${userId}/...`.
  if (!storagePath.startsWith(`${auth.userId}/`)) {
    return errorResponse("FORBIDDEN", "You do not own this file", 403);
  }

  const svc = getServiceClient();

  // 1) Already an MP4 → no conversion needed, hand back a signed source URL.
  if (storagePath.toLowerCase().split("?")[0].endsWith(".mp4")) {
    const { data, error } = await svc.storage.from(bucket).createSignedUrl(storagePath, SIGNED_TTL);
    if (error || !data?.signedUrl) {
      return errorResponse("SIGN_FAILED", "Could not sign source URL", 500);
    }
    return jsonResponse({ status: "completed", url: data.signedUrl, bucket, path: storagePath, alreadyMp4: true });
  }

  // Deterministic cache key so re-exporting the same file is instant.
  const hash = await sha256Hex(`${bucket}:${storagePath}`);
  const outputPath = `${auth.userId}/${hash}.mp4`;

  // 2) Cached export already present?
  const { data: cached } = await svc.storage
    .from("mp4-exports")
    .createSignedUrl(outputPath, SIGNED_TTL);
  if (cached?.signedUrl) {
    return jsonResponse({ status: "completed", url: cached.signedUrl, bucket: "mp4-exports", path: outputPath, cached: true });
  }

  // 3) Create a job and trigger the worker.
  const { data: job, error: insErr } = await svc
    .from("mp4_export_jobs")
    .insert({
      user_id: auth.userId,
      source_bucket: bucket,
      source_path: storagePath,
      output_path: outputPath,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !job) {
    return errorResponse("JOB_CREATE_FAILED", "Could not create export job", 500);
  }

  // Fire-and-forget the worker (separate invocation = its own time budget).
  const workerUrl = `${getEnv("SUPABASE_URL")}/functions/v1/mp4-export-worker`;
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const kick = fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
      "apikey": serviceKey,
      "x-internal-token": serviceKey,
    },
    body: JSON.stringify({ jobId: job.id }),
  }).catch((e) => console.error("[mp4-export-create] worker kick failed", e));
  // @ts-ignore EdgeRuntime is available in Supabase edge runtime.
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(kick);
  }

  return jsonResponse({ status: "processing", jobId: job.id });
});
