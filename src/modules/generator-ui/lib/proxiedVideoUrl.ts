// Wraps an external video URL through our same-origin video-proxy edge function
// so the bytes come back with proper CORS headers (required for canvas capture
// in the merger and last-frame extractor).
//
// URLs that are already same-origin or hosted on our own Supabase storage are
// returned unchanged.

import { supabase } from "@/integrations/supabase/client";
import { FUNCTIONS_BASE } from "@/core/api/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const OWN_SUPABASE_HOST = `${PROJECT_ID}.supabase.co`;

export async function proxiedVideoUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  // Same-origin or our own Supabase storage host — no proxy needed.
  if (typeof window !== "undefined" && parsed.host === window.location.host) {
    return url;
  }
  if (parsed.host === OWN_SUPABASE_HOST) {
    return url;
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    // Not signed in — fall back to the raw URL (will likely fail CORS, but
    // the caller will surface a clearer error).
    return url;
  }

  const qs = new URLSearchParams({ url, token });
  return `${FUNCTIONS_BASE}/video-proxy?${qs.toString()}`;
}
