// nas-storage — serves the Storage dialog from a Synology NAS folder over SFTP.
//
// Actions (query param `action`):
//   list   GET  -> { files: [{ path, name, size, mtime, ext, kind }] }
//   stream GET  -> raw bytes of one file, with HTTP Range support
//   delete POST -> { deleted: string[], failed: string[] }  body: { paths: string[] }
//
// Auth: valid Supabase JWT (Authorization header, or `token` query param for
// <video>/<img>/<audio> which cannot set headers).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  connect,
  sftpDelete,
  sftpList,
  sftpReadRange,
  sftpStatSize,
} from "../_shared/synology-ssh.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type",
};

const BASE_DIR = "/volume1/video/REBAR SHOP OS VIDEOS";

const VIDEO_EXT = ["mp4", "mov", "webm", "mkv", "avi", "m4v"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"];
const AUDIO_EXT = ["mp3", "wav", "m4a", "aac", "ogg", "flac"];

function kindFor(ext: string): "film" | "image" | "audio" | null {
  if (VIDEO_EXT.includes(ext)) return "film";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (AUDIO_EXT.includes(ext)) return "audio";
  return null;
}

const MIME: Record<string, string> = {
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
  avi: "video/x-msvideo", m4v: "video/x-m4v",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", bmp: "image/bmp", avif: "image/avif",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac",
  ogg: "audio/ogg", flac: "audio/flac",
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function authenticate(req: Request, urlObj: URL): Promise<boolean> {
  let token: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) token = authHeader.slice("Bearer ".length);
  else token = urlObj.searchParams.get("token");
  if (!token) return false;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.getUser(token);
  return !error && !!data?.user?.id;
}

/** Ensure a requested path stays inside BASE_DIR (no traversal). */
function safePath(rel: string): string | null {
  // `rel` is the path relative to BASE_DIR sent by the client.
  if (rel.includes("..") || rel.includes("\0")) return null;
  const clean = rel.replace(/^\/+/, "");
  const full = `${BASE_DIR}/${clean}`;
  if (!full.startsWith(BASE_DIR + "/")) return null;
  return full;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "list";

  if (!(await authenticate(req, url))) return json({ error: "Unauthorized" }, 401);

  try {
    if (action === "list") {
      const conn = await connect();
      try {
        const entries = await sftpList(conn, BASE_DIR);
        const files = entries
          .filter((e) => !e.isDirectory)
          .map((e) => {
            const ext = extOf(e.name);
            const kind = kindFor(ext);
            return kind
              ? { path: e.name, name: e.name, size: e.size, mtime: e.mtime, ext, kind }
              : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
          .sort((a, b) => b.mtime - a.mtime);
        return json({ files });
      } finally {
        conn.end();
      }
    }

    if (action === "stream") {
      const rel = url.searchParams.get("path");
      if (!rel) return json({ error: "Missing path" }, 400);
      const full = safePath(rel);
      if (!full) return json({ error: "Invalid path" }, 400);
      const ext = extOf(rel);
      const contentType = MIME[ext] ?? "application/octet-stream";

      const conn = await connect();
      try {
        const size = await sftpStatSize(conn, full);
        const range = req.headers.get("range");
        let start = 0;
        let end = size - 1;
        let status = 200;
        if (range) {
          const m = range.match(/bytes=(\d*)-(\d*)/);
          if (m) {
            if (m[1]) start = parseInt(m[1], 10);
            if (m[2]) end = parseInt(m[2], 10);
            if (Number.isNaN(start)) start = 0;
            if (Number.isNaN(end) || end >= size) end = size - 1;
            // Cap a single response chunk to keep memory bounded (8 MB).
            const MAX = 8 * 1024 * 1024;
            if (end - start + 1 > MAX) end = start + MAX - 1;
            status = 206;
          }
        }
        const bytes = await sftpReadRange(conn, full, start, end);
        const headers: Record<string, string> = {
          ...corsHeaders,
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
          "Content-Length": String(bytes.byteLength),
          "Cache-Control": "private, max-age=60",
        };
        if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
        return new Response(bytes, { status, headers });
      } finally {
        conn.end();
      }
    }

    if (action === "delete") {
      if (req.method !== "POST") return json({ error: "Use POST" }, 405);
      const body = await req.json().catch(() => null) as { paths?: string[] } | null;
      const paths = body?.paths;
      if (!Array.isArray(paths) || paths.length === 0) return json({ error: "paths required" }, 400);
      const deleted: string[] = [];
      const failed: string[] = [];
      const conn = await connect();
      try {
        for (const rel of paths) {
          const full = safePath(rel);
          if (!full) { failed.push(rel); continue; }
          try {
            await sftpDelete(conn, full);
            deleted.push(rel);
          } catch {
            failed.push(rel);
          }
        }
      } finally {
        conn.end();
      }
      return json({ deleted, failed });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? "Internal error" }, 500);
  }
});
