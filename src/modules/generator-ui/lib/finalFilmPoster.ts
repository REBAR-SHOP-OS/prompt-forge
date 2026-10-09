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
  if (!dataUrl || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) return null;
  try {
    const response = await fetchImpl(dataUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    const path = `${userId}/posters/${filmId}.${posterExtension(blob.type)}`;
    const result = await upload(path, blob, {
      contentType: blob.type || "image/jpeg",
      upsert: true,
    });
    if (result.error) return null;
    return `${bucket}/${path}`;
  } catch {
    return null;
  }
}
