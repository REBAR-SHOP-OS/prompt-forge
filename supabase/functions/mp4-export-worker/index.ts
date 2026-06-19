// Edge function: MP4 export worker.
// Internal-only (called by mp4-export-create). Performs the real ffmpeg
// conversion on the Synology box over SSH and uploads the MP4 to mp4-exports.
// On any failure the job is marked failed with a clear reason — never WebM.
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/core/http.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";
import { getEnv } from "../_shared/core/env.ts";
import { connect, exec, readSynologyConfig } from "../_shared/synology-ssh.ts";

const DL_TTL = 60 * 60 * 2; // 2h to allow the download + transcode

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405);

  // Internal auth: only callable with the service-role token.
  const token = req.headers.get("x-internal-token");
  if (!token || token !== getEnv("SUPABASE_SERVICE_ROLE_KEY")) {
    return errorResponse("UNAUTHORIZED", "Internal only", 401);
  }

  let jobId = "";
  try {
    const body = await req.json();
    jobId = typeof body?.jobId === "string" ? body.jobId : "";
  } catch {
    return errorResponse("BAD_REQUEST", "Invalid JSON", 400);
  }
  if (!jobId) return errorResponse("BAD_REQUEST", "jobId required", 400);

  const svc = getServiceClient();
  const { data: job, error: jobErr } = await svc
    .from("mp4_export_jobs")
    .select("id, user_id, source_bucket, source_path, output_path, status")
    .eq("id", jobId)
    .single();
  if (jobErr || !job) return errorResponse("NOT_FOUND", "Job not found", 404);
  if (job.status === "completed" || job.status === "failed") {
    return jsonResponse({ status: job.status });
  }

  const fail = async (reason: string) => {
    await svc.from("mp4_export_jobs").update({ status: "failed", error: reason }).eq("id", jobId);
    return jsonResponse({ status: "failed", error: reason });
  };

  const cfg = readSynologyConfig();
  if (!cfg) return await fail("MP4 export service unavailable");

  await svc.from("mp4_export_jobs").update({ status: "processing" }).eq("id", jobId);

  // Is the source already on the NAS? If so, read it back through the SFTP-based
  // stream endpoint over HTTPS. We must NOT `cp` the nas_path directly: the SSH
  // shell and the SFTP subsystem do not share the same filesystem root on this
  // DSM box, so a file written via SFTP is not visible to a shell `cp`/ffmpeg.
  const { data: srcObj } = await svc
    .from("storage_objects")
    .select("id, backend, nas_path")
    .eq("logical_bucket", job.source_bucket)
    .eq("object_key", job.source_path)
    .maybeSingle();
  const sourceOnNas = srcObj?.backend === "synology" && !!srcObj?.nas_path;

  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  let downloadCmd: string;
  if (sourceOnNas) {
    const streamUrl =
      `${getEnv("SUPABASE_URL")}/functions/v1/synology-storage-stream?id=${srcObj!.id}`;
    // Token passed via an env var (not argv) so it isn't visible in the box's
    // process list. ffmpeg reads the downloaded file locally afterwards.
    downloadCmd =
      `curl -fsSL -H "x-internal-token: $INTERNAL_TOKEN" "${streamUrl}" -o "$tmp/in"`;
  } else {
    const { data: dl, error: dlErr } = await svc.storage
      .from(job.source_bucket)
      .createSignedUrl(job.source_path, DL_TTL);
    if (dlErr || !dl?.signedUrl) return await fail("Could not access source video");
    downloadCmd = `curl -fsSL "${dl.signedUrl}" -o "$tmp/in"`;
  }

  // Signed upload URL for the converted MP4 (scoped, one-time token; no secrets on the box).
  const outputPath = job.output_path as string;
  const { data: up, error: upErr } = await svc.storage
    .from("mp4-exports")
    .createSignedUploadUrl(outputPath);
  if (upErr || !up?.token) return await fail("Could not prepare export storage");
  const uploadUrl =
    `${getEnv("SUPABASE_URL")}/storage/v1/object/upload/sign/mp4-exports/${outputPath}?token=${up.token}`;

  // Build the remote conversion command. URLs contain only URL-safe characters.
  const remoteCmd = [
    "set -e",
    'FF="$(command -v ffmpeg || echo /usr/local/bin/ffmpeg)"',
    'tmp="$(mktemp -d)"',
    'trap \'rm -rf "$tmp"\' EXIT',
    downloadCmd,
    `"$FF" -y -i "$tmp/in" -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart "$tmp/out.mp4"`,
    `curl -fsS -X PUT -H "content-type: video/mp4" --data-binary "@$tmp/out.mp4" "${uploadUrl}"`,
  ].join("\n");


  let conn;
  try {
    conn = await connect(cfg);
  } catch (e) {
    console.error("[mp4-export-worker] ssh connect failed", e instanceof Error ? e.message : e);
    return await fail("MP4 export service unavailable");
  }

  try {
    const res = await exec(conn, remoteCmd);
    if (res.code !== 0) {
      console.error("[mp4-export-worker] conversion failed", res.code, res.stderr.slice(-500));
      return await fail("MP4 conversion failed");
    }
  } catch (e) {
    console.error("[mp4-export-worker] exec error", e instanceof Error ? e.message : e);
    return await fail("MP4 conversion failed");
  } finally {
    try { conn.end(); } catch { /* ignore */ }
  }

  // Verify the upload actually landed before declaring success.
  const { data: verify } = await svc.storage
    .from("mp4-exports")
    .createSignedUrl(outputPath, 60);
  if (!verify?.signedUrl) return await fail("Converted file missing after upload");

  await svc.from("mp4_export_jobs").update({ status: "completed", error: null }).eq("id", jobId);
  return jsonResponse({ status: "completed" });
});
