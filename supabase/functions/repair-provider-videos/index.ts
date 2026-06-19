// One-time / on-demand repair: re-host any video asset whose storage_path is
// still an external provider URL (e.g. DashScope/WAN temporary links) into our
// own durable storage. Provider URLs that have already expired can't be
// downloaded and are reported as "unrecoverable" (left untouched).
//
// Admin-only. Safe to run repeatedly: already-durable rows are skipped.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Missing token" }, 401);

    // Identify caller and require admin role.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Admin-only: this function performs outbound fetches to URLs stored in
    // asset rows. Enforce the admin role server-side (never trust the client).
    const { data: isAdmin, error: roleErr } = await svc.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) return json({ error: "Role check failed" }, 500);
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const ownStoragePrefix = `${new URL(SUPABASE_URL).origin}/storage/v1/object/`;

    // Find the caller's own non-durable assets (external provider URLs).
    const { data: rows, error } = await svc
      .from("generator_video_assets")
      .select("id, user_id, storage_path")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .not("storage_path", "like", `${ownStoragePrefix}%`);
    if (error) return json({ error: error.message }, 500);

    const candidates = (rows ?? []).filter(
      (r) => typeof r.storage_path === "string" && /^https?:\/\//.test(r.storage_path),
    );

    let repaired = 0;
    let unrecoverable = 0;
    const failures: Array<{ id: string; reason: string }> = [];

    for (const row of candidates) {
      try {
        const res = await fetch(row.storage_path);
        if (!res.ok) {
          unrecoverable++;
          failures.push({ id: row.id, reason: `HTTP ${res.status} (likely expired)` });
          continue;
        }
        const contentType = res.headers.get("content-type") || "video/mp4";
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.byteLength === 0) {
          unrecoverable++;
          failures.push({ id: row.id, reason: "0 bytes" });
          continue;
        }
        const ext = contentType.includes("webm")
          ? "webm"
          : (row.storage_path.split("?")[0].toLowerCase().endsWith(".webm") ? "webm" : "mp4");
        const uploadType = ext === "webm" ? "video/webm" : "video/mp4";
        const path = `${row.user_id}/repaired-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await svc.storage
          .from("merged-videos")
          .upload(path, bytes, { contentType: uploadType, upsert: false });
        if (upErr) {
          failures.push({ id: row.id, reason: `upload: ${upErr.message}` });
          continue;
        }
        const { data: pub } = svc.storage.from("merged-videos").getPublicUrl(path);
        const { error: updErr } = await svc
          .from("generator_video_assets")
          .update({ storage_path: pub.publicUrl })
          .eq("id", row.id);
        if (updErr) {
          failures.push({ id: row.id, reason: `db update: ${updErr.message}` });
          continue;
        }
        repaired++;
      } catch (e) {
        unrecoverable++;
        failures.push({ id: row.id, reason: (e as Error).message });
      }
    }

    return json({
      ok: true,
      scanned: candidates.length,
      repaired,
      unrecoverable,
      failures,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
