// CPU-safe helpers for the preview evaluator image read.
// Pure TypeScript so they run unchanged in Deno and in Vitest.

export class ImageTooLargeError extends Error {
  constructor() {
    super("Preview image is too large to evaluate");
    this.name = "ImageTooLargeError";
  }
}

/**
 * Reads a response body into bytes, aborting as soon as `maxBytes` is
 * exceeded instead of buffering an arbitrarily large body first.
 */
export async function readBoundedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ImageTooLargeError();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Base64 without per-byte JS arrays: each chunk is passed straight from the
 * typed array to String.fromCharCode, and partial strings are joined once.
 * Chunk size is a multiple of 3 so chunk encodings concatenate exactly.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x6000; // 24,576 bytes, divisible by 3
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    parts.push(btoa(String.fromCharCode.apply(null, chunk as unknown as number[])));
  }
  return parts.join("");
}
