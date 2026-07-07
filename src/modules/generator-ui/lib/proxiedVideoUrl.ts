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

import { supabase } from "@/integrations/supabase/client";
import { FUNCTIONS_BASE } from "@/core/api/client";

// Storage buckets that are now PRIVATE. Any stored URL pointing at one of these
// (whether saved in the old `…/object/public/<bucket>/…` form, the
// authenticated `…/object/<bucket>/…` form, or a previous `…/object/sign/…`
// form) must be re-signed on demand so the bytes load. Owners can sign their
// own files via RLS; the resulting signed URL is CORS-enabled and Range-capable
// and needs no auth header, so it can feed a <video> element directly.
const PRIVATE_STORAGE_BUCKETS = ["merged-videos", "user-videos"];h
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

export async function proxiedVideoUrl(url: string): Promise<string> {
  if (!url) return url;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  // Same-origin (e.g. relative URLs already on our domain) — no proxy needed.
  if (typeof window !== "undefined" && parsed.host === window.location.host) {
    return url;
  }

  // Our own Supabase Storage objects in a PRIVATE bucket: mint a fresh signed
  // URL. This covers playback, downloads, and merge inputs that go through this
  // helper. If signing fails (not signed in / not owner), fall back to the raw
  // URL so behavior degrades gracefully rather than throwing.
  const own = parseOwnStorage(parsed);
  if (own && PRIVATE_STORAGE_BUCKETS.includes(own.bucket)) {
    const { data, error } = await supabase.storage
      .from(own.bucket)
      .createSignedUrl(own.path, SIGNED_URL_TTL_SECONDS);
    if (!error && data?.signedUrl) {
      const { data: sessionData } = await supabase.auth.getSession();
      const proxyToken = sessionData.session?.access_token;
      if (proxyToken) {
        const pq = new URLSearchParams({ url: data.signedUrl, token: proxyToken });
        return `${FUNCTIONS_BASE}/video-proxy?${pq.toString()}`;
      }
      return data.signedUrl;
    }
    return url;
  }

  // Other own-storage PUBLIC objects (e.g. user-images, wan-frames) are already
  // CORS-enabled and Range-capable, and crucially require NO auth token. Routing
  // them through the auth'd video-proxy would bake a short-lived access token
  // into the URL; once that expires the card goes blank. Play directly.
  if (parsed.pathname.includes("/storage/v1/object/public/")) {
    return url;
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    // Not signed in — fall back to the raw URL.
    return url;
  }

  const qs = new URLSearchParams({ url, token });
  return `${FUNCTIONS_BASE}/video-proxy?${qs.toString()}`;
}
