// Same-origin streaming proxy for external video URLs.
// The provider (Aliyun OSS) does not return CORS headers, which prevents
// loading the video into a <video crossOrigin="anonymous"> element for
// canvas capture (needed by the in-browser merger and last-frame seeder).
//
// Authenticated clients first POST the target with an Authorization header.
// The function returns a short-lived opaque HMAC token for GET/HEAD playback.
// Supabase JWTs are never transported in a query string.

import { authenticate } from "../_shared/core/auth.ts";
import {
  signVideoProxyTarget,
  verifyVideoProxyToken,
} from "./proxy-token.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag",
};

const ALLOWED_HOST_SUFFIXES = [
  "aliyuncs.com",     // dashscope-*.oss-*.aliyuncs.com
  "supabase.co",      // own storage
  "supabase.in",
];

function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith(`.${suffix}`));
}

function isAllowedTarget(target: string): boolean {
  try {
    const parsed = new URL(target);
    return parsed.protocol === "https:" && isAllowedHost(parsed.hostname);
  } catch {
    return false;
  }
}

function signingSecret(): string {
  return Deno.env.get("VIDEO_PROXY_SIGNING_SECRET")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const reqUrl = new URL(req.url);
  const secret = signingSecret();
  if (!secret) {
    return new Response(JSON.stringify({ error: "Video proxy is not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST") {
    const auth = await authenticate(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json().catch(() => ({}));
    const target = typeof body?.url === "string" ? body.url.trim() : "";
    if (!target || !isAllowedTarget(target)) {
      return new Response(JSON.stringify({ error: "Target URL is not allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const proxyToken = await signVideoProxyTarget(target, secret);
    const playbackUrl = `${reqUrl.origin}${reqUrl.pathname}?proxy_token=${encodeURIComponent(proxyToken)}`;
    return new Response(JSON.stringify({ url: playbackUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const proxyToken = reqUrl.searchParams.get("proxy_token") ?? "";
  const target = await verifyVideoProxyToken(proxyToken, secret);
  if (!target || !isAllowedTarget(target)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const respHeaders = new Headers(corsHeaders);
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
