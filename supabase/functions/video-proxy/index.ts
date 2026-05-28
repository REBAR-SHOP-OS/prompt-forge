// Same-origin streaming proxy for external video URLs.
// The provider (Aliyun OSS) does not return CORS headers, which prevents
// loading the video into a <video crossOrigin="anonymous"> element for
// canvas capture (needed by the in-browser merger and last-frame seeder).
//
// This function re-serves the bytes with permissive CORS headers and
// supports HTTP Range requests so <video> can seek.
//
// Usage: GET /video-proxy?url=<encoded>&token=<access_token>
// Auth: requires a valid Supabase JWT. Token may come from the
// Authorization header OR (because <video> can't set headers) from a
// `token` query string parameter.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "../_shared/core/http.ts";

const EXPOSE_HEADERS = "Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag";
const cors = (req: Request) => ({
  ...getCorsHeaders(req, { exposeHeaders: EXPOSE_HEADERS, methods: "GET, HEAD, OPTIONS" }),
  // Range is needed for <video> seeking; not in the base allowed-headers set.
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range, x-request-id",
});


const ALLOWED_HOST_SUFFIXES = [
  "aliyuncs.com",     // dashscope-*.oss-*.aliyuncs.com
  "supabase.co",      // own storage
  "supabase.in",
];

function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith(`.${suffix}`));
}

async function authenticate(req: Request, urlObj: URL): Promise<boolean> {
  let token: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice("Bearer ".length);
  } else {
    token = urlObj.searchParams.get("token");
  }
  if (!token) return false;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.getUser(token);
  return !error && !!data?.user?.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors(req) });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }

  const reqUrl = new URL(req.url);

  if (!(await authenticate(req, reqUrl))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }

  const target = reqUrl.searchParams.get("url");
  if (!target) {
    return new Response(JSON.stringify({ error: "Missing url" }), {
      status: 400,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(target);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid url" }), {
      status: 400,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }

  if (upstreamUrl.protocol !== "https:" && upstreamUrl.protocol !== "http:") {
    return new Response(JSON.stringify({ error: "Unsupported protocol" }), {
      status: 400,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }
  if (!isAllowedHost(upstreamUrl.hostname)) {
    return new Response(JSON.stringify({ error: "Host not allowed" }), {
      status: 400,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }

  const fwdHeaders: Record<string, string> = {};
  const range = req.headers.get("Range");
  if (range) fwdHeaders["Range"] = range;

  let upstream: Response;
  try {
    // IMPORTANT:
    // 1. Pass the original `target` string (not upstreamUrl.toString()) — URL
    //    re-serialization breaks signed-URL signatures (e.g. Aliyun OSS).
    // 2. ALWAYS fetch upstream with GET. Aliyun OSS v1 signed URLs include the
    //    HTTP method in the signature payload, so a URL signed for GET returns
    //    403 on HEAD. The browser's <video> element issues HEAD preflights for
    //    range support; we satisfy them by doing a GET upstream and stripping
    //    the body when the client asked for HEAD.
    upstream = await fetch(target, {
      method: "GET",
      headers: fwdHeaders,
      redirect: "follow",
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: `Upstream fetch failed: ${(e as Error).message}` }), {
      status: 502,
      headers: { ...cors(req), "Content-Type": "application/json" },
    });
  }

  const respHeaders = new Headers(cors(req));
  const passthrough = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified", "cache-control"];
  for (const h of passthrough) {
    const v = upstream.headers.get(h);
    if (v) respHeaders.set(h, v);
  }
  if (!respHeaders.has("content-type")) {
    respHeaders.set("content-type", "video/mp4");
  }
  if (!respHeaders.has("accept-ranges")) {
    respHeaders.set("accept-ranges", "bytes");
  }

  // For HEAD: discard the body but reply with the upstream status + headers
  // so the client gets accurate Content-Length / Accept-Ranges.
  if (req.method === "HEAD") {
    try { await upstream.body?.cancel(); } catch { /* ignore */ }
    return new Response(null, {
      status: upstream.status,
      headers: respHeaders,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
});
