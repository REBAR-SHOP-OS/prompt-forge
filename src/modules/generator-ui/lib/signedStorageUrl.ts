// Centralized helper that converts either a stored "public-style" Supabase
// URL (legacy) or a relative storage key into a fresh, short-lived **signed**
// URL. Used after the user-images / overlay-assets / merged-videos buckets
// were converted to private.
//
// The DB still stores the legacy `https://<project>.supabase.co/storage/v1/
// object/public/<bucket>/<key>` URL strings for existing rows. We parse the
// bucket + key out of those URLs and request a signed URL on demand.
//
// A small in-memory cache avoids re-signing the same key on every render.
// Signed URLs expire after `TTL_SECONDS`; we refresh them ~30s before expiry.

import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

const PRIVATE_BUCKETS = new Set(['user-images', 'overlay-assets', 'merged-videos'])
const TTL_SECONDS = 60 * 60 // 1 hour
const REFRESH_MARGIN_MS = 30_000

interface CacheEntry {
  url: string
  expiresAt: number
  inflight?: Promise<string>
}

const cache = new Map<string, CacheEntry>()

function parseBucketAndKey(input: string): { bucket: string; key: string } | null {
  // Match Supabase public URL: .../storage/v1/object/public/<bucket>/<key...>
  // Also match signed: .../storage/v1/object/sign/<bucket>/<key...>
  try {
    const u = new URL(input)
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/)
    if (m) {
      const key = decodeURIComponent(m[2].split('?')[0])
      return { bucket: m[1], key }
    }
  } catch {
    // Not a URL — assume it's a "<bucket>/<key>" relative path
    const slash = input.indexOf('/')
    if (slash > 0) {
      return { bucket: input.slice(0, slash), key: input.slice(slash + 1) }
    }
  }
  return null
}

/**
 * Resolve any stored value (full public URL or relative path) into a URL the
 * browser can actually fetch. Returns the input unchanged for buckets that
 * aren't on the private list (e.g. wan-frames is still public).
 */
export async function resolveSignedUrl(stored: string | null | undefined): Promise<string> {
  if (!stored) return ''
  const parsed = parseBucketAndKey(stored)
  if (!parsed || !PRIVATE_BUCKETS.has(parsed.bucket)) return stored

  const cacheKey = `${parsed.bucket}/${parsed.key}`
  const now = Date.now()
  const hit = cache.get(cacheKey)
  if (hit && hit.expiresAt - REFRESH_MARGIN_MS > now) return hit.url
  if (hit?.inflight) return hit.inflight

  const inflight = (async () => {
    const { data, error } = await supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.key, TTL_SECONDS)
    if (error || !data?.signedUrl) {
      // Fallback: return the original (will likely 400, but caller surfaces it).
      return stored
    }
    cache.set(cacheKey, { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 })
    return data.signedUrl
  })()
  cache.set(cacheKey, { url: hit?.url ?? '', expiresAt: hit?.expiresAt ?? 0, inflight })
  try {
    return await inflight
  } finally {
    const e = cache.get(cacheKey)
    if (e) delete e.inflight
  }
}

/** React hook: resolve a stored URL/path into a usable signed URL. */
export function useSignedUrl(stored: string | null | undefined): string {
  const [url, setUrl] = useState<string>(() => {
    if (!stored) return ''
    const parsed = parseBucketAndKey(stored)
    if (!parsed || !PRIVATE_BUCKETS.has(parsed.bucket)) return stored
    return cache.get(`${parsed.bucket}/${parsed.key}`)?.url ?? ''
  })

  useEffect(() => {
    let cancelled = false
    if (!stored) {
      setUrl('')
      return
    }
    void resolveSignedUrl(stored).then((u) => {
      if (!cancelled) setUrl(u)
    })
    return () => {
      cancelled = true
    }
  }, [stored])

  return url
}
