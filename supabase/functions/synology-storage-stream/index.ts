// Edge function: stream a Synology-backed file to the client.
// Validates JWT + ownership, honors Range requests, and pipes the file straight
// from the NAS over SFTP. Used as the src for <video>/<img> and downloads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, errorResponse } from "../_shared/core/http.ts";
import { getEnv } from "../_shared/core/env.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";
import {
  connect,
  readSynologyConfig,
  sftp,
  sftpReadStream,
  sftpStat,
} from "../_shared/synology-ssh.ts";

async function resolveUserId(req: Request, url: URL): Promise<string | null> {
  const header = req.headers.get("Authorization");
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : url.searchParams.get("token");
  if (!token) return null;
  const client = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"));
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const m = header.match(/bytes=(\d*)-(\d*)/);
  if (!m) return null;
  let start = m[1] ? parseInt(m[1], 10) : 0;
  let end = m[2] ? parseInt(m[2], 10) : size - 1;
  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end) || end >= size) end = size - 1;
  if (start > end || start >= size) return null;
  return { start, end };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { ...corsHeaders, "Access-Control-Allow-Methods": "GET, OPTIONS" },
    });
  }
  if (req.method !== "GET") return errorResponse("METHOD_NOT_ALLOWED", "Use GET", 405);

  const url = new URL(req.url);

  // Internal callers (e.g. mp4-export-worker on the NAS) authenticate with the
  // service-role token and read any owner's file by id. Everyone else must be a
  // signed-in user reading their own file.
  const internal = req.headers.get("x-internal-token") === getEnv("SUPABASE_SERVICE_ROLE_KEY");
  let userId: string | null = null;
  if (!internal) {
    userId = await resolveUserId(req, url);
    if (!userId) return errorResponse("UNAUTHORIZED", "Sign in required", 401);
  }

  const id = url.searchParams.get("id") ?? "";
  if (!id) return errorResponse("BAD_REQUEST", "id required", 400);

  const svc = getServiceClient();
  let query = svc
    .from("storage_objects")
    .select("user_id, nas_path, content_type, size_bytes, backend")
    .eq("id", id);
  if (!internal) query = query.eq("user_id", userId as string);
  const { data: row, error } = await query.single();
  if (error || !row) return errorResponse("NOT_FOUND", "File not found", 404);
  if (row.backend !== "synology" || !row.nas_path) {
    return errorResponse("WRONG_BACKEND", "File is not on the NAS", 409);
  }

  const cfg = readSynologyConfig();
  if (!cfg) return errorResponse("STORAGE_UNAVAILABLE", "Storage backend unavailable", 503);

  let conn;
  try {
    conn = await connect(cfg);
  } catch (e) {
    console.error("[synology-storage-stream] ssh connect failed", e instanceof Error ? e.message : e);
    return errorResponse("STORAGE_UNAVAILABLE", "Storage backend unreachable", 503);
  }

  try {
    const sftpClient = await sftp(conn);
    const stat = await sftpStat(sftpClient, row.nas_path as string);
    if (!stat) {
      try { conn.end(); } catch { /* ignore */ }
      return errorResponse("NOT_FOUND", "File missing on backend", 404);
    }
    const size = stat.size;
    const contentType = (row.content_type as string) || "application/octet-stream";
    const download = url.searchParams.get("download");

    const baseHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    };
    if (download) {
      baseHeaders["Content-Disposition"] = `attachment; filename="${download.replace(/"/g, "")}"`;
    }

    const range = parseRange(req.headers.get("Range"), size);
    const onDone = () => { try { conn.end(); } catch { /* ignore */ } };

    if (range) {
      const body = sftpReadStream(sftpClient, row.nas_path as string, { start: range.start, end: range.end }, onDone);
      return new Response(body, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
          "Content-Length": String(range.end - range.start + 1),
        },
      });
    }

    const body = sftpReadStream(sftpClient, row.nas_path as string, {}, onDone);
    return new Response(body, {
      status: 200,
      headers: { ...baseHeaders, "Content-Length": String(size) },
    });
  } catch (e) {
    try { conn.end(); } catch { /* ignore */ }
    console.error("[synology-storage-stream] read error", e instanceof Error ? e.message : e);
    return errorResponse("STORAGE_UNAVAILABLE", "Could not read file", 503);
  }
});
