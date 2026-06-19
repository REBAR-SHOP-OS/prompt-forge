// Edge function: delete a Synology-backed file and its pointer row.
// Validates JWT + ownership, removes the NAS file over SFTP, deletes the row.
import { corsHeaders, errorResponse, jsonResponse, readJsonBody } from "../_shared/core/http.ts";
import { authenticate } from "../_shared/core/auth.ts";
import { getServiceClient } from "../_shared/core/supabase.ts";
import {
  connect,
  readSynologyConfig,
  sftp,
  sftpRemove,
} from "../_shared/synology-ssh.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "Use POST", 405);

  const auth = await authenticate(req);
  if (!auth) return errorResponse("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await readJsonBody<{ id?: unknown }>(req);
  if (!parsed.ok) return parsed.response;
  const id = typeof parsed.value.id === "string" ? parsed.value.id : "";
  if (!id) return errorResponse("BAD_REQUEST", "id required", 400);

  const svc = getServiceClient();
  const { data: row, error } = await svc
    .from("storage_objects")
    .select("user_id, nas_path, backend")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .single();
  if (error || !row) return errorResponse("NOT_FOUND", "File not found", 404);

  if (row.backend === "synology" && row.nas_path) {
    const cfg = readSynologyConfig();
    if (!cfg) return errorResponse("STORAGE_UNAVAILABLE", "Storage backend unavailable", 503);
    let conn;
    try {
      conn = await connect(cfg);
      const sftpClient = await sftp(conn);
      await sftpRemove(sftpClient, row.nas_path as string);
    } catch (e) {
      console.error("[synology-storage-delete] remove error", e instanceof Error ? e.message : e);
      return errorResponse("STORAGE_UNAVAILABLE", "Could not delete file", 503);
    } finally {
      try { conn?.end(); } catch { /* ignore */ }
    }
  }

  await svc.from("storage_objects").delete().eq("id", id).eq("user_id", auth.userId);
  return jsonResponse({ ok: true });
});
