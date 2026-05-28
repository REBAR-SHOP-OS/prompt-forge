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

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    // Not signed in — fall back to the raw URL.
    return url;
  }

  const qs = new URLSearchParams({ url, token });
  return `${FUNCTIONS_BASE}/video-proxy?${qs.toString()}`;
}
