import type { OwnedStorageRef } from "./owned-storage.ts";

export class MediaFetchError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function storageObjectUrl(origin: string, ref: OwnedStorageRef): string {
  const path = ref.path.split("/").map(encodeURIComponent).join("/");
  return `${origin}/storage/v1/object/${encodeURIComponent(ref.bucket)}/${path}`;
}

export async function fetchBoundedStorageObject(options: {
  origin: string;
  serviceKey: string;
  ref: OwnedStorageRef;
  maxBytes: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(storageObjectUrl(options.origin, options.ref), {
    headers: {
      apikey: options.serviceKey,
      Authorization: `Bearer ${options.serviceKey}`,
    },
    redirect: "error",
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  if (!response.ok) throw new MediaFetchError(`Could not load media (${response.status})`, 502);

  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > options.maxBytes) {
    throw new MediaFetchError("Media is too large", 413);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new MediaFetchError("Media stream is not readable", 502);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > options.maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new MediaFetchError("Media is too large", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { bytes, contentType: response.headers.get("content-type") };
}
