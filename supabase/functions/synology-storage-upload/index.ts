// Edge function: upload a large file to the Synology NAS.
// Validates JWT + ownership, streams the request body to the NAS over SFTP,
// records a pointer row in storage_objects. No Cloud fallback: if the NAS is
// unreachable the call fails with STORAGE_UNAVAILABLE.
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";
import {
  connect,
  getMediaBasePath,
  readSynologyConfig,
  sftp,
  sftpMkdirP,
  sftpPutStream,
  sftpStat,
} from "../_shared/synology-ssh.ts";

const ALLOWED_BUCKETS = new Set([
  "user-videos",
  "merged-videos",
  "user-images",
  "wan-frames",
  "user-audio",
  "mp4-exports",
]);

function sanitizeKey(key: string): string | null {
  if (!key || key.includes("..") || key.startsWith("/")) return null;
  // keep it to a safe charset
  if (!/^[A-Za-z0-9/_.\-]+$/.test(key)) return null;
  return key;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405);

  const auth = await authenticate(req);
  if (!auth) return errorResponse("UNAUTHORIZED", "Sign in required", 401);

  const url = new URL(req.url);
  const bucket = url.searchParams.get("bucket") ?? "";
  const rawKey = url.searchParams.get("key") ?? "";
  const contentType = req.headers.get("content-type") || "application/octet-stream";

  if (!ALLOWED_BUCKETS.has(bucket)) {
    return errorResponse("INVALID_BUCKET", "Unsupported bucket", 400);
  }
  const key = sanitizeKey(rawKey);
  if (!key) return errorResponse("INVALID_KEY", "Invalid object key", 400);
  // Ownership: every key lives under `${userId}/...`.
  if (!key.startsWith(`${auth.userId}/`)) {
    return errorResponse("FORBIDDEN", "You do not own this path", 403);
  }
  if (!req.body) return errorResponse("BAD_REQUEST", "Missing request body", 400);

  const cfg = readSynologyConfig();
  if (!cfg) return errorResponse("STORAGE_UNAVAILABLE", "MP4/storage service unavailable", 503);

  const base = getMediaBasePath();
  const nasPath = `${base}/${bucket}/${key}`;
  const nasDir = nasPath.slice(0, nasPath.lastIndexOf("/"));

  let conn;
  try {
    conn = await connect(cfg);
  } catch (e) {
    console.error("[synology-storage-upload] ssh connect failed", e instanceof Error ? e.message : e);
    return errorResponse("STORAGE_UNAVAILABLE", "Storage backend unreachable", 503);
  }

  try {
    const sftpClient = await sftp(conn);
    await sftpMkdirP(sftpClient, nasDir);
    await sftpPutStream(sftpClient, nasPath, req.body);
    const stat = await sftpStat(sftpClient, nasPath);
    if (!stat) return errorResponse("STORAGE_WRITE_FAILED", "File missing after upload", 502);

    const svc = getServiceClient();
    const { data: row, error: insErr } = await svc
      .from("storage_objects")
      .upsert({
        user_id: auth.userId,
        logical_bucket: bucket,
        object_key: key,
        backend: "synology",
        nas_path: nasPath,
        size_bytes: stat.size,
        content_type: contentType,
        status: "active",
      }, { onConflict: "logical_bucket,object_key" })
      .select("id")
      .single();
    if (insErr || !row) {
      console.error("[synology-storage-upload] row insert failed", insErr);
      return errorResponse("STORAGE_INDEX_FAILED", "Could not record file", 500);
    }

    return jsonResponse({
      id: row.id,
      bucket,
      key,
      backend: "synology",
      size: stat.size,
    });
  } catch (e) {
    console.error("[synology-storage-upload] write error", e instanceof Error ? e.message : e);
    return errorResponse("STORAGE_UNAVAILABLE", "Could not store file on backend", 503);
  } finally {
    try { conn.end(); } catch { /* ignore */ }
  }
});
