// Admin-only: set another user's password. Caller must hold the 'admin' role
// (checked server-side via has_role). The password is never logged or returned.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/core/http.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(url, service);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
  if (isAdmin !== true) return json({ error: "forbidden" }, 403);

  let body: { email?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 255) return json({ error: "Enter a valid email" }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: "Password must be 8–72 characters" }, 400);

  // Find the target user by email.
  let targetId: string | null = null;
  for (let page = 1; page <= 20 && !targetId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return json({ error: "lookup_failed" }, 500);
    targetId = data.users.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!targetId) return json({ error: "No user with that email" }, 404);

  const { error: updErr } = await admin.auth.admin.updateUserById(targetId, { password });
  if (updErr) return json({ error: updErr.message }, 400);

  console.log(`admin-set-password: admin ${userData.user.id} updated user ${targetId}`);
  return json({ ok: true });
});
