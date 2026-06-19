// Edge function: migrate existing large Cloud files to the Synology NAS.
// Internal-only (service-role token). Processes a bounded batch per call so it
// can be invoked repeatedly until everything is moved. Non-destructive: the
// Cloud copy is removed only after the NAS write is verified.
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/core/http.ts";
import { getEnv } from "../_shared/core/env.ts";
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

const BUCKETS = [
  "user-videos",
  "merged-videos",
  "user-images",
  "wan-frames",
  "user-audio",
  "mp4-exports",
];

function minBytes(): number {
  const raw = Deno.env.get("SYNOLOGY_MIN_BYTES");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : 0; // 0 = migrate everything regardless of size
}

interface FileEntry { path: string; size: number; userId: string; contentType: string }

// Recursively list files in a bucket up to `cap` entries that exceed `min` bytes.
async function listLargeFiles(svc: any, bucket: string, min: number, cap: number): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  const stack: string[] = [""];
  while (stack.length && out.length < cap) {
    const prefix = stack.pop() as string;
    const { data, error } = await svc.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error || !data) continue;
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null || item.metadata === null) {
        // folder
        stack.push(full);
        continue;
      }
      const size = Number(item.metadata?.size ?? 0);
      if (size < min) continue;
      const userId = full.split("/")[0] || "";
      if (!userId) continue;
      out.push({
        path: full,
        size,
        userId,
        contentType: item.metadata?.mimetype || "application/octet-stream",
      });
      if (out.length >= cap) break;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405);

  // Authorize via internal service-role token OR an authenticated admin user.
  const internalToken = req.headers.get("x-internal-token");
  let authorized = !!internalToken && internalToken === getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!authorized) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (jwt) {
      try {
        const svcAuth = getServiceClient();
        const { data: userData } = await svcAuth.auth.getUser(jwt);
        const uid = userData?.user?.id;
        if (uid) {
          const { data: isAdmin } = await svcAuth.rpc("has_role", {
            _user_id: uid,
            _role: "admin",
          });
          authorized = isAdmin === true;
        }
      } catch (_e) { /* unauthorized */ }
    }
  }
  if (!authorized) {
    return errorResponse("UNAUTHORIZED", "Internal only", 401);
  }

  let body: { bucket?: string; limit?: number } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  const targetBuckets = body.bucket && BUCKETS.includes(body.bucket) ? [body.bucket] : BUCKETS;
  const cap = Math.min(Math.max(body.limit ?? 5, 1), 25);

  const cfg = readSynologyConfig();
  if (!cfg) return errorResponse("STORAGE_UNAVAILABLE", "Storage backend unavailable", 503);

  const svc = getServiceClient();
  const min = minBytes();
  const base = getMediaBasePath();

  // SFTP transfers can outlast the caller's HTTP timeout. Run the batch in the
  // background and return immediately; the caller polls `storage_objects` for
  // progress. Non-destructive: cloud copy removed only after a verified write.
  const runBatch = async () => {
    let conn;
    try {
      conn = await connect(cfg);
    } catch (e) {
      console.error("[migrate] ssh connect failed", e instanceof Error ? e.message : e);
      return;
    }

    let done = 0;
    try {
      const sftpClient = await sftp(conn);

      for (const bucket of targetBuckets) {
        if (done >= cap) break;
        const files = await listLargeFiles(svc, bucket, min, cap);

        for (const f of files) {
          if (done >= cap) break;

          // Skip if already tracked on NAS.
          const { data: existing } = await svc
            .from("storage_objects")
            .select("id, backend")
            .eq("logical_bucket", bucket)
            .eq("object_key", f.path)
            .maybeSingle();
          if (existing?.backend === "synology") continue;

          const nasPath = `${base}/${bucket}/${f.path}`;
          const nasDir = nasPath.slice(0, nasPath.lastIndexOf("/"));

          try {
            // Mark migrating.
            await svc.from("storage_objects").upsert({
              user_id: f.userId,
              logical_bucket: bucket,
              object_key: f.path,
              backend: "cloud",
              size_bytes: f.size,
              content_type: f.contentType,
              status: "migrating",
            }, { onConflict: "logical_bucket,object_key" });

            const { data: signed, error: signErr } = await svc.storage
              .from(bucket)
              .createSignedUrl(f.path, 60 * 60);
            if (signErr || !signed?.signedUrl) throw new Error("sign failed");

            const resp = await fetch(signed.signedUrl);
            if (!resp.ok || !resp.body) throw new Error(`download ${resp.status}`);

            await sftpMkdirP(sftpClient, nasDir);
            await sftpPutStream(sftpClient, nasPath, resp.body);

            const stat = await sftpStat(sftpClient, nasPath);
            if (!stat || stat.size === 0) throw new Error("verify failed");

            await svc.from("storage_objects").update({
              backend: "synology",
              nas_path: nasPath,
              size_bytes: stat.size,
              status: "active",
            }).eq("logical_bucket", bucket).eq("object_key", f.path);

            // Cloud copy removed only after verified NAS write.
            await svc.storage.from(bucket).remove([f.path]);
            done++;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("[migrate] file failed", bucket, f.path, msg);
            await svc.from("storage_objects").update({ status: "failed" })
              .eq("logical_bucket", bucket).eq("object_key", f.path);
            done++;
          }
        }
      }
    } catch (e) {
      console.error("[migrate] fatal", e instanceof Error ? e.message : e);
    } finally {
      try { conn.end(); } catch { /* ignore */ }
    }
    console.log(`[migrate] batch done: ${done} processed`);
  };

  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(runBatch());
  else runBatch();

  return jsonResponse({ status: "started", cap });
});
});
