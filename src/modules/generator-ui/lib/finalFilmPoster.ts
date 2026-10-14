export interface PosterUploadResult {
  error: { message?: string } | null;
}

export type PosterUploader = (
  path: string,
  blob: Blob,
  options: { contentType: string; upsert: boolean },
) => PromiseLike<PosterUploadResult>;

function posterExtension(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export async function persistFinalFilmPoster(
  dataUrl: string | null,
  userId: string,
  filmId: string,
  bucket: string,
  upload: PosterUploader,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const mimeMatch = dataUrl?.match(/^data:(image\/[a-z0-9.+-]+);base64,/i);
  if (!mimeMatch) return null;
  try {
    const response = await fetchImpl(dataUrl);
    if (!response.ok) return null;
    const sourceBlob = await response.blob();
    const contentType = mimeMatch[1].toLowerCase();
    const blob = sourceBlob.type === contentType
      ? sourceBlob
      : new Blob([await sourceBlob.arrayBuffer()], { type: contentType });
    const path = `${userId}/posters/${filmId}.${posterExtension(contentType)}`;
    const result = await upload(path, blob, {
      contentType,
      upsert: true,
    });
    if (result.error) return null;
    return `${bucket}/${path}`;
  } catch {
    return null;
  }
}

/**
 * In-bucket storage path of the poster object referenced by a Final Film's
 * `video.thumbnail_url`, or null when the reference is not a storage-backed
 * poster (legacy inline data, blob/external URL, or a non-poster object in
 * the bucket). Deleting a merged film must remove this object as well as the
 * video file, or the poster leaks in the bucket with nothing referencing it.
 * Persisted references are bucket-relative (`<bucket>/<userId>/posters/…`);
 * full storage URLs are accepted for robustness.
 */
export function posterPathFromThumbnailRef(
  thumbnailUrl: string | null | undefined,
  bucket: string,
): string | null {
  if (!thumbnailUrl) return null;
  if (thumbnailUrl.startsWith("data:") || thumbnailUrl.startsWith("blob:")) return null;
  let path: string | null = null;
  const relativePrefix = `${bucket}/`;
  if (thumbnailUrl.startsWith(relativePrefix)) {
    path = thumbnailUrl.slice(relativePrefix.length);
  } else {
    const marker = `/${bucket}/`;
    const markerIndex = thumbnailUrl.indexOf(marker);
    if (markerIndex >= 0) {
      path = thumbnailUrl.slice(markerIndex + marker.length).split(/[?#]/)[0];
    }
  }
  if (!path) return null;
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the raw path if it is not valid percent-encoding.
  }
  return path.includes("/posters/") ? path : null;
}
