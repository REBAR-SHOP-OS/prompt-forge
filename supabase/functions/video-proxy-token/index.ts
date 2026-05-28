// Mints a short-lived, purpose-limited HMAC token for the video-proxy.
// Requires a valid Supabase access token in the Authorization header.
// Body: { url: string }
// Response: { token, expiresAt }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, jsonResponse, errorResponse, startRequest, readJsonBody } from "../_shared/core/http.ts";
import { mintProxyToken } from "../_shared/core/proxyToken.ts";

const ALLOWED_HOST_SUFFIXES = ["aliyuncs.com", "supabase.co", "supabase.in"];
function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req, { methods: "POST, OPTIONS" });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const ctx = startRequest(req, "video-proxy-token");

  if (req.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "POST required", 405, ctx.requestId);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("UNAUTHORIZED", "Missing bearer token", 401, ctx.requestId);
  }
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return errorResponse("SERVER_MISCONFIG", "env missing", 500, ctx.requestId);
  }
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.getUser(authHeader.slice("Bearer ".length));
  if (error || !data?.user?.id) {
    return errorResponse("UNAUTHORIZED", "Invalid token", 401, ctx.requestId);
  }
  const userId = data.user.id;

  const body = await readJsonBody<{ url?: unknown }>(req, ctx.requestId, 4096);
  if (!body.ok) return body.response;
  const target = typeof body.value.url === "string" ? body.value.url : "";
  if (!target) {
    return errorResponse("INVALID_INPUT", "url required", 400, ctx.requestId);
  }
  let parsed: URL;
  try { parsed = new URL(target); } catch {
    return errorResponse("INVALID_INPUT", "invalid url", 400, ctx.requestId);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return errorResponse("INVALID_INPUT", "unsupported protocol", 400, ctx.requestId);
  }
  if (!isAllowedHost(parsed.hostname)) {
    return errorResponse("HOST_NOT_ALLOWED", "host not allowed", 400, ctx.requestId);
  }

  try {
    const { token, expiresAt } = await mintProxyToken(userId, target);
    return jsonResponse({ token, expiresAt, requestId: ctx.requestId }, 200, cors);
  } catch (e) {
    console.error(JSON.stringify({ route: "video-proxy-token", requestId: ctx.requestId, error: (e as Error).message }));
    return errorResponse("MINT_FAILED", "could not mint token", 500, ctx.requestId);
  }
});
