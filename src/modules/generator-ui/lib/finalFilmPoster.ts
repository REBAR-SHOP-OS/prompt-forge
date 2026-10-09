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
