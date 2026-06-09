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

  // Our own Supabase Storage PUBLIC objects are already CORS-enabled and
  // Range-capable, and crucially require NO auth token. Routing them through
  // the auth'd video-proxy would bake a short-lived access token into the URL;
  // once that token expires (tab left open a while, sign-out/in) the proxied
  // URL starts returning 401 and the card goes blank. Public Final Film output
  // (merged-videos) and other public buckets must be played directly so they
  // keep working indefinitely.
  if (parsed.pathname.includes("/storage/v1/object/public/")) {
    return url;
  }

  // The nas-storage edge function already serves bytes with CORS + Range and
  // carries its own token in the query string — never double-proxy it.
  if (parsed.pathname.includes("/functions/v1/nas-storage")) {
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
