// Same-origin streaming proxy for external video URLs.
// The provider (Aliyun OSS) does not return CORS headers, which prevents
// loading the video into a <video crossOrigin="anonymous"> element for
// canvas capture (needed by the in-browser merger and last-frame seeder).
//
// This function re-serves the bytes with controlled CORS headers and
// supports HTTP Range requests so <video> can seek.
//
// Usage: GET /video-proxy?url=<encoded>
// Auth: requires a valid Supabase JWT in the Authorization header.

import { authenticate } from "../_shared/core/auth.ts";
import { corsHeaders, errorResponse, methodNotAllowed, preflightResponse, startRequest } from "../_shared/core/http.ts";

const passthroughResponseHeaders = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "cache-control",
];

const ALLOWED_HOST_SUFFIXES = [
  "aliyuncs.com",
];

const ALLOWED_CONTENT_TYPES = [
  "application/octet-stream",
  "binary/octet-stream",
];

const MAX_REDIRECTS = 3;
const MAX_TARGET_URL_LENGTH = 2_048;
const UPSTREAM_FETCH_TIMEOUT_MS = 30_000;

function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith(`.${suffix}`));
}

function isSupportedProtocol(protocol: string): boolean {
  return protocol === "https:";
}

function isAllowedContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return normalized.startsWith("video/") || ALLOWED_CONTENT_TYPES.includes(normalized);
}

async function fetchUpstream(req: Request, url: URL, redirectCount = 0): Promise<Response> {
  const headers = new Headers();
  const range = req.headers.get("Range");
  if (range) headers.set("Range", range);

  const upstream = await fetch(url.toString(), {
    method: req.method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS),
  });

  if (upstream.status >= 300 && upstream.status < 400) {
    if (redirectCount >= MAX_REDIRECTS) {
      throw new Error("Too many upstream redirects");
    }

    const location = upstream.headers.get("location");
    if (!location) {
      throw new Error("Redirect missing location header");
    }

    const redirectedUrl = new URL(location, url);
    if (!isSupportedProtocol(redirectedUrl.protocol) || !isAllowedHost(redirectedUrl.hostname)) {
      throw new Error("Redirect target not allowed");
    }

    return await fetchUpstream(req, redirectedUrl, redirectCount + 1);
  }

  return upstream;
}

Deno.serve(async (req) => {
  const ctx = startRequest(req, "/video-proxy");
  if (req.method === "OPTIONS") {
    return preflightResponse(req, {
      "Access-Control-Expose-Headers":
        "Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag",
      "X-Request-Id": ctx.requestId,
    });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return methodNotAllowed(req, ["GET", "HEAD"], ctx.requestId);
  }

  if (!(await authenticate(req))) {
    return errorResponse(req, "UNAUTHORIZED", "Unauthorized", 401, ctx.requestId);
  }

  const reqUrl = new URL(req.url);
  const target = reqUrl.searchParams.get("url");
  if (!target) {
    return errorResponse(req, "MISSING_URL", "Missing url", 400, ctx.requestId);
  }
  if (target.length > MAX_TARGET_URL_LENGTH) {
    return errorResponse(req, "URL_TOO_LONG", "Video url is too long", 400, ctx.requestId);
  }

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(target);
  } catch {
    return errorResponse(req, "INVALID_URL", "Invalid url", 400, ctx.requestId);
  }

  if (!isSupportedProtocol(upstreamUrl.protocol)) {
    return errorResponse(req, "UNSUPPORTED_PROTOCOL", "Unsupported protocol", 400, ctx.requestId);
  }

  if (!isAllowedHost(upstreamUrl.hostname)) {
    return errorResponse(req, "HOST_NOT_ALLOWED", "Host not allowed", 400, ctx.requestId);
  }

  let upstream: Response;
  try {
    upstream = await fetchUpstream(req, upstreamUrl);
  } catch (error) {
    return errorResponse(
      req,
      "UPSTREAM_FETCH_FAILED",
      error instanceof Error ? error.message : "Upstream fetch failed",
      502,
      ctx.requestId,
    );
  }

  if (!isAllowedContentType(upstream.headers.get("content-type"))) {
    return errorResponse(req, "UNSUPPORTED_CONTENT_TYPE", "Upstream content type is not allowed", 415, ctx.requestId);
  }

  const responseHeaders = new Headers(corsHeaders(req));
  responseHeaders.set(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges, Content-Type, ETag",
  );
  responseHeaders.set("Cache-Control", "private, no-store");
  responseHeaders.set("X-Request-Id", ctx.requestId);

  for (const header of passthroughResponseHeaders) {
    const value = upstream.headers.get(header);
    if (value) responseHeaders.set(header, value);
  }

  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "video/mp4");
  }

  if (!responseHeaders.has("accept-ranges")) {
    responseHeaders.set("accept-ranges", "bytes");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
});
