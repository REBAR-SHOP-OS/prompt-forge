// Wraps a video URL through our same-origin video-proxy edge function so the
// bytes come back with proper CORS headers and HTTP Range support.
//
// Phase 2 hardening: we no longer append the Supabase JWT to the URL.
// Instead we call the authenticated `video-proxy-token` mint endpoint to
// obtain a short-lived HMAC token bound to (user, exact target URL,
// expiry, purpose=video_proxy) and pass it as `pt=...`.
//
// Returned unchanged:
//   - blob: / data: URLs
//   - same-origin relative paths (already CORS-safe)

import { supabase } from "@/integrations/supabase/client";
import { FUNCTIONS_BASE } from "@/core/api/client";

interface MintedToken {
  token: string;
  expiresAt: number; // unix seconds
}

// In-memory cache keyed by target URL. Tokens are valid for ~1h server-side;
// we re-mint with 5 min safety margin.
const tokenCache = new Map<string, MintedToken>();
const inflight = new Map<string, Promise<MintedToken | null>>();
const SAFETY_MARGIN_SEC = 5 * 60;

async function mintToken(url: string): Promise<MintedToken | null> {
  const cached = tokenCache.get(url);
  const nowSec = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - SAFETY_MARGIN_SEC > nowSec) return cached;

  const existing = inflight.get(url);
  if (existing) return existing;

  const p = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return null;
      const res = await fetch(`${FUNCTIONS_BASE}/video-proxy-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { token?: string; expiresAt?: number };
      if (!body?.token || !body?.expiresAt) return null;
      const minted: MintedToken = { token: body.token, expiresAt: body.expiresAt };
      tokenCache.set(url, minted);
      return minted;
    } catch {
      return null;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
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

  const minted = await mintToken(url);
  if (!minted) {
    // Not signed in or mint failed — fall back to the raw URL.
    return url;
  }

  const qs = new URLSearchParams({ url, pt: minted.token });
  return `${FUNCTIONS_BASE}/video-proxy?${qs.toString()}`;
}
