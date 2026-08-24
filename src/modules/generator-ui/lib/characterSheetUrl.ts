import { supabase } from '@/integrations/supabase/client'

const USER_IMAGES_BUCKET = 'user-images'

// Supabase storage URLs are served from a project subdomain of supabase.co.
const SUPABASE_STORAGE_HOST = /\.supabase\.co$/

// Canonical Supabase storage path: /storage/v1/object/{public|sign}/user-images/<key>
const STORAGE_PATH_RE = new RegExp(
  `/storage/v1/object/(?:public|sign)/${USER_IMAGES_BUCKET}/(.+)$`,
)

/**
 * Canonicalize any storage reference into a `user-images` object key.
 *
 * Accepts three shapes and normalizes them all to the same bucket key:
 *   - raw key:            `userId/uuid.png`
 *   - public URL:         `https://<ref>.supabase.co/storage/v1/object/public/user-images/userId/uuid.png`
 *   - signed URL:         `https://<ref>.supabase.co/storage/v1/object/sign/user-images/userId/uuid.png?token=***`
 *
 * Query strings and hashes are dropped and the path is percent-decoded so a
 * signed URL with a token never leaks into the key. Only Supabase storage URLs
 * (a `*.supabase.co` host with the canonical `/storage/v1/object/...` path) are
 * accepted; a foreign host or path returns `null` so it can never be treated as
 * a valid object key.
 */
export function resolveObjectKey(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null
  const raw = storagePath.trim()
  if (!raw) return null
  if (/^blob:|^data:/.test(raw)) return null

  try {
    const url = new URL(raw)
    if (!SUPABASE_STORAGE_HOST.test(url.hostname)) return null
    const match = url.pathname.match(STORAGE_PATH_RE)
    if (!match) return null
    return decodeURIComponent(match[1])
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
