// Signing helpers for private-bucket image paths.
//
// Extracted from DashboardPage so surfaces outside that file (LibraryCardPreview)
// can render a stored image path safely. Behaviour is unchanged — this is a
// move, not a rewrite.
import { supabase } from '@/integrations/supabase/client'

export const USER_IMAGES_BUCKET = 'user-images'
export const FRAMES_BUCKET = 'wan-frames'

/**
 * Private buckets (user-images, wan-frames, …) store paths as public URLs
 * (.../object/public/<bucket>/<key>) which return 400/"Bucket not found"
 * when loaded in an <img>. Detect which private bucket an object lives in and
 * return both the bucket id and the bucket-relative key so we can sign it.
 */
const SIGNABLE_IMAGE_BUCKETS = [USER_IMAGES_BUCKET, FRAMES_BUCKET] as const

export function resolveImageBucketKey(
  storagePath: string | null | undefined,
): { bucket: string; key: string } | null {
  if (!storagePath) return null
  const cleanKey = (value: string) => value.split('#')[0].split('?')[0].replace(/^\/+/, '')
  for (const bucket of SIGNABLE_IMAGE_BUCKETS) {
    const marker = `/${bucket}/`
    const idx = storagePath.indexOf(marker)
    if (idx >= 0) return { bucket, key: cleanKey(storagePath.slice(idx + marker.length)) }
  }
  // Already a bucket-relative key (no http origin, no signed/blob/data URL).
  if (!/^https?:|^blob:|^data:/.test(storagePath)) {
    return { bucket: USER_IMAGES_BUCKET, key: cleanKey(storagePath) }
  }
  return null
}

/** Resolve a displayable signed URL for a private-bucket image. Falls back to the raw value. */
export async function signUserImageUrl(storagePath: string | null | undefined): Promise<string> {
  const raw = storagePath ?? ''
  // Already a directly-usable URL that isn't a (broken) public-bucket URL.
  if (/^blob:|^data:/.test(raw)) return raw
  const resolved = resolveImageBucketKey(raw)
  if (!resolved) return raw
  try {
    const { data, error } = await supabase.storage
      .from(resolved.bucket)
      .createSignedUrl(resolved.key, 60 * 60 * 24 * 365)
    if (!error && data?.signedUrl) return data.signedUrl
  } catch {
    /* fall through */
  }
  return raw
}

/** Sign every image row's storage_path so private-bucket thumbnails render. */
export async function signUserImageRows<T extends { storage_path: string }>(rows: T[]): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => ({ ...row, storage_path: await signUserImageUrl(row.storage_path) })),
  )
}
