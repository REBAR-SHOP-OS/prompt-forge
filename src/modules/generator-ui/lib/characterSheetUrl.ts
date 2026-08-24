import { supabase } from '@/integrations/supabase/client'

const USER_IMAGES_BUCKET = 'user-images'

/**
 * Canonicalize any storage reference into a `user-images` object key.
 *
 * Accepts three shapes and normalizes them all to the same bucket key:
 *   - raw key:            `userId/uuid.png`
 *   - public URL:         `https://<host>/storage/v1/object/public/user-images/userId/uuid.png`
 *   - signed URL:         `https://<host>/storage/v1/object/sign/user-images/userId/uuid.png?token=...`
 *
 * Query strings and hashes are dropped and the path is percent-decoded so a
 * signed URL with a token never leaks into the key. Returns `null` for
 * non-storage references (blob/data URLs, foreign hosts, empty values).
 */
export function resolveObjectKey(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null
  const raw = storagePath.trim()
  if (!raw) return null
  if (/^blob:|^data:/.test(raw)) return null

  try {
    const url = new URL(raw)
    const marker = `/${USER_IMAGES_BUCKET}/`
    const idx = url.pathname.indexOf(marker)
    if (idx < 0) return null
    const key = url.pathname.slice(idx + marker.length)
    return decodeURIComponent(key)
  } catch {
    // Not a URL — treat as a raw key unless it looks like an absolute URL.
    if (/^https?:/i.test(raw)) return null
    return decodeURIComponent(raw)
  }
}

/**
 * Build a fresh signed URL for a `user-images` object.
 *
 * Unlike the previous implementation, this NEVER returns a raw private URL and
 * NEVER trusts an existing `/object/sign/` URL (which may be expired). It
 * always re-signs from the canonical key. On any failure it returns `null` so
 * the caller can render a readable placeholder instead of a broken image.
 */
export async function signUrl(storagePath: string | null | undefined): Promise<string | null> {
  const raw = storagePath ?? ''
  if (/^blob:|^data:/.test(raw)) return raw
  const key = resolveObjectKey(raw)
  if (!key) return null
  try {
    const { data, error } = await supabase.storage
      .from(USER_IMAGES_BUCKET)
      .createSignedUrl(key, 60 * 60 * 24 * 365)
    if (!error && data?.signedUrl) return data.signedUrl
  } catch {
    /* fall through */
  }
  return null
}
