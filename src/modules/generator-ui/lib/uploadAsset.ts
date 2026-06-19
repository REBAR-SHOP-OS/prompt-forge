// Routes file uploads to the right backend: large files (>= threshold) go to the
// Synology NAS via the synology-storage-upload edge function; smaller files stay
// in Lovable Cloud storage. Both return a bare `<bucket>/<path>` reference that
// resolveSignedUrl / proxiedVideoUrl know how to turn into a usable URL (NAS
// stream URL or Cloud signed URL). No silent fallback: if a large file cannot be
// stored on the NAS, the call throws so the caller can surface a clear error.
import { supabase } from "@/integrations/supabase/client";
import { FUNCTIONS_BASE } from "@/core/api/client";

// Files at or above this size are stored on the NAS. Keep in sync with the
// worker's SYNOLOGY_MIN_BYTES default.
export const NAS_THRESHOLD_BYTES = 20 * 1024 * 1024; // 20 MB

export interface UploadResult {
  /** Bare `<bucket>/<path>` reference to persist and later resolve. */
  ref: string;
  bucket: string;
  path: string;
  backend: "cloud" | "synology";
}

/**
 * Upload a blob/file, choosing NAS vs Cloud by size. Returns a reference string
 * to store in the database. Throws on failure (large NAS uploads never silently
 * fall back to Cloud).
 */
export async function uploadAsset(
  bucket: string,
  path: string,
  data: Blob | File,
  opts: { contentType?: string; upsert?: boolean } = {},
): Promise<UploadResult> {
  const contentType =
    opts.contentType || (data as File).type || "application/octet-stream";

  if (data.size >= NAS_THRESHOLD_BYTES) {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("You must be signed in to upload.");

    const qs = new URLSearchParams({ bucket, key: path });
    const resp = await fetch(`${FUNCTIONS_BASE}/synology-storage-upload?${qs.toString()}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      body: data,
    });
    if (!resp.ok) {
      let msg = "Storage backend unavailable. Please try again later.";
      try {
        const j = await resp.json();
        if (j?.error?.message) msg = j.error.message;
      } catch { /* keep default */ }
      throw new Error(msg);
    }
    return { ref: `${bucket}/${path}`, bucket, path, backend: "synology" };
  }

  // Small file: normal Cloud upload.
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, data, { contentType, upsert: opts.upsert ?? false });
  if (error) throw error;
  return { ref: `${bucket}/${path}`, bucket, path, backend: "cloud" };
}
