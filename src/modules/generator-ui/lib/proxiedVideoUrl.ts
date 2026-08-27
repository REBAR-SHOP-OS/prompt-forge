// Wraps a video URL through our same-origin video-proxy edge function so the
// bytes come back with proper CORS headers and HTTP Range support. We route
// ALL external/HTTP video URLs through the proxy — including our own Supabase
// Storage — so cards, previews, trim, merge, and last-frame extraction all
// use the exact same playback path. A single code path eliminates the
// random "Video unavailable" flicker we used to see when one component got
// the raw Storage URL and another got the proxied URL for the same asset.
//
// Returned unchanged:
//   - blob: / data: URLs
//   - same-origin relative paths (already CORS-safe)
//
// Fail-closed: when signing or auth fails the function throws — it never
// returns a raw private-bucket URL. This prevents the caller from caching
// a broken URL that would blank the card forever.

import { supabase } from "@/integrations/supabase/client";
import { FUNCTIONS_BASE } from "@/core/api/client";

// Storage buckets that are now PRIVATE. Any stored URL pointing at one of these
// (whether saved in the old `…/object/public/<bucket>/…` form, the
// authenticated `…/object/<bucket>/…` form, or a previous `…/object/sign/…`
// form) must be re-signed on demand so the bytes load. Owners can sign their
// own files via RLS; the resulting signed URL is CORS-enabled and Range-capable
// and needs no auth header, so it can feed a <video> element directly.
const PRIVATE_STORAGE_BUCKETS = ["merged-videos", "user-videos"];
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 2; // 2 hours

function parseOwnStorage(parsed: URL): { bucket: string; path: string } | null {
  const m = parsed.pathname.match(
    /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/(.+)$/,
  );
  if (!m) return null;
  try {
    return { bucket: m[1], path: decodeURIComponent(m[2]) };
  } catch {
    return { bucket: m[1], path: m[2] };
  }
}

/**
 * Try to parse a bucket-relative path ("merged-videos/user/file.mp4") into
 * { bucket, path }. Returns null if the format doesn't match a known
 * private-bucket prefix.
 */
function parseBucketRelative(input: string): { bucket: string; path: string } | null {
  for (const b of PRIVATE_STORAGE_BUCKETS) {
    if (input === b || input.startsWith(b + "/")) {
      const path = input.slice(b.length + 1);
      if (!path) return null;
      return { bucket: b, path };
    }
  }
  return null;
}

/**
 * Resolve a private-bucket object to a playable URL. Mints a fresh signed
 * URL and optionally wraps it in the same-origin video-proxy for CORS/Range.
 * Throws on signing failure — never returns a raw private URL.
 */
async function resolvePrivateBucket(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to sign ${bucket}/${path}: ${error?.message ?? "unknown"}`);
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const proxyToken = sessionData.session?.access_token;
  if (proxyToken) {
    const pq = new URLSearchParams({ url: data.signedUrl, token: proxyToken });
    return `${FUNCTIONS_BASE}/video-proxy?${pq.toString()}`;
  }
  // Signed URL without proxy token — the signed URL itself is CORS-enabled
  // and Range-capable, so it can feed a <video> element directly.
  return data.signedUrl;
}

export async function proxiedVideoUrl(url: string): Promise<string> {
  if (!url) return url;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;

  // ── 1. Bucket-relative paths ("merged-videos/user/file.mp4") ──────────
  // These are stored in the DB without a full URL. Resolve them to a signed
  // URL via the Supabase client.
  const rel = parseBucketRelative(url);
  if (rel) {
    return resolvePrivateBucket(rel.bucket, rel.path);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a valid URL and not a bucket-relative path — throw so the caller
    // does not cache a broken string.
    throw new Error(`Invalid video URL: ${url}`);
  }

  // Same-origin (e.g. relative URLs already on our domain) — no proxy needed.
  if (typeof window !== "undefined" && parsed.host === window.location.host) {
    return url;
  }

  // ── 2. Own Supabase Storage — private bucket ───────────────────────────
  // Mint a fresh signed URL. Fail-closed: if signing fails (not signed in,
  // not owner, RLS denial), throw — never return the raw private URL, which
  // would produce a 400/403 and leave the card blank forever.
  const own = parseOwnStorage(parsed);
  if (own && PRIVATE_STORAGE_BUCKETS.includes(own.bucket)) {
    return resolvePrivateBucket(own.bucket, own.path);
  }

  // ── 3. Own Supabase Storage — public bucket ───────────────────────────
  // Already CORS-enabled and Range-capable, requires NO auth token. Play
  // directly — routing through the auth'd proxy would bake a short-lived
  // access token into the URL that expires and blanks the card.
  if (parsed.pathname.includes("/storage/v1/object/public/")) {
    return url;
  }

  // ── 4. External URLs (e.g. Aliyun OSS) — route through video-proxy ───
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    // Not signed in — throw so the caller shows a proper failure instead of
    // returning a raw URL that will fail with CORS errors.
    throw new Error("Not authenticated: cannot proxy video URL");
  }

  const qs = new URLSearchParams({ url, token });
  return `${FUNCTIONS_BASE}/video-proxy?${qs.toString()}`;
}