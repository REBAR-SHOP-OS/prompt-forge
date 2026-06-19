// Centralized signed-URL resolution for PRIVATE Supabase Storage buckets.
//
// Several buckets are now private (user-images, wan-frames, user-videos,
// merged-videos, user-audio, overlay-assets). Any value we previously stored as
// a public URL (`…/object/public/<bucket>/…`), an authenticated URL
// (`…/object/authenticated/<bucket>/…`), a signed URL (`…/object/sign/<bucket>/…`)
// or a bare `<bucket>/<path>` reference must be re-signed on demand so the bytes
// load for the owner. Owners can sign their own files via RLS; the resulting
// signed URL is CORS-enabled and needs no auth header, so it can feed an <img>
// or <video> element directly.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const PRIVATE_BUCKETS = [
  "user-images",
  "wan-frames",
  "user-videos",
  "merged-videos",
  "user-audio",
  "overlay-assets",
];

const SIGNED_TTL_SECONDS = 60 * 60 * 2; // 2 hours
// Re-sign a little before the real expiry so a long-lived card never goes blank.
const CACHE_SAFETY_SECONDS = 300;

type CacheEntry = { url: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();

/**
 * Extract `{ bucket, path }` from any stored reference: a public/sign/authenticated
 * Storage URL, or a bare `<bucket>/<path>` string. Returns null for blob:/data:/
 * external URLs or unrecognized values.
 */
export function parseStorageRef(value: string): { bucket: string; path: string } | null {
  if (!value) return null;
  if (value.startsWith("blob:") || value.startsWith("data:")) return null;

  // Full Storage URL form.
  try {
    const parsed = new URL(value);
    const m = parsed.pathname.match(
      /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/(.+)$/,
    );
    if (m) {
      try {
        return { bucket: m[1], path: decodeURIComponent(m[2].split("?")[0]) };
      } catch {
        return { bucket: m[1], path: m[2].split("?")[0] };
      }
    }
    // A non-storage absolute URL (external CDN etc.) — not ours.
    return null;
  } catch {
    // Not an absolute URL — fall through to bare-path handling.
  }

  // Bare `<bucket>/<path>` reference.
  const slash = value.indexOf("/");
  if (slash > 0) {
    const bucket = value.slice(0, slash);
    const path = value.slice(slash + 1);
    if (PRIVATE_BUCKETS.includes(bucket) && path) return { bucket, path };
  }
  return null;
}

/**
 * Resolve a stored reference into a usable URL. For private-bucket references we
 * mint (and cache) a fresh signed URL. Everything else (blob:, data:, external
 * URLs, public buckets, unsignable references) is returned unchanged so behavior
 * degrades gracefully rather than throwing.
 */
export async function resolveSignedUrl(
  value: string | null | undefined,
  ttlSeconds: number = SIGNED_TTL_SECONDS,
): Promise<string> {
  if (!value) return value ?? "";
  if (value.startsWith("blob:") || value.startsWith("data:")) return value;

  const ref = parseStorageRef(value);
  if (!ref || !PRIVATE_BUCKETS.includes(ref.bucket)) return value;

  const cacheKey = `${ref.bucket}/${ref.path}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, ttlSeconds);
  if (error || !data?.signedUrl) return value;

  cache.set(cacheKey, {
    url: data.signedUrl,
    expiresAt: Date.now() + (ttlSeconds - CACHE_SAFETY_SECONDS) * 1000,
  });
  return data.signedUrl;
}

/**
 * Best initial value to render before the async sign resolves:
 *  - a cached signed URL when we already have one (no flash),
 *  - "" for a private-bucket reference we still need to sign (rendering the raw
 *    public/bare URL would fire a doomed request and flash a broken image),
 *  - the value unchanged for everything else (blob:, data:, external, public).
 */
function initialResolved(value: string | null | undefined): string {
  if (!value) return "";
  if (value.startsWith("blob:") || value.startsWith("data:")) return value;
  const ref = parseStorageRef(value);
  if (!ref || !PRIVATE_BUCKETS.includes(ref.bucket)) return value;
  const cached = cache.get(`${ref.bucket}/${ref.path}`);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  return "";
}

/**
 * React hook: returns a freshly signed URL for a stored reference. Renders a
 * cached signed URL (or nothing for an unsigned private ref) first, then swaps
 * in the freshly signed URL once resolved — never firing a doomed request for a
 * private bucket's raw public/bare URL.
 */
export function useSignedUrl(value: string | null | undefined): string {
  const [resolved, setResolved] = useState<string>(() => initialResolved(value));
  useEffect(() => {
    let active = true;
    if (!value) {
      setResolved("");
      return;
    }
    setResolved(initialResolved(value));
    resolveSignedUrl(value)
      .then((url) => {
        if (active) setResolved(url);
      })
      .catch(() => {
        if (active) setResolved(value);
      });
    return () => {
      active = false;
    };
  }, [value]);
  return resolved;
}
