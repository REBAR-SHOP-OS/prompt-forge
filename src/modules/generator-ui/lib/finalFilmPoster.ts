interface PosterUploadResult {
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
    const contentType = mimeMatch[1].toLowerCase();
    // Decode bytes from the data URL itself, not response.blob(): host
    // Response/Blob interop is not faithful for data URLs (jsdom stringifies
    // Blob bodies and its Blob lacks arrayBuffer), while the data URL is this
    // function's actual input and decodes byte-exact regardless of the host
    // Response/Blob behavior. Percent-decode first, as fetch did, so a
    // percent-encoded base64 payload still decodes.
    const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const binary = atob(payload.includes("%") ? decodeURIComponent(payload) : payload);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: contentType });
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
