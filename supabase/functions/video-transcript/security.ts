import { parseOwnedStorageRef, type OwnedStorageRef } from "../_shared/core/owned-storage.ts";

export const MAX_REQUEST_BYTES = 30 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 18 * 1024 * 1024;
export const MAX_TRANSCRIPT_CHARS = 100_000;
export const TRANSCRIPT_RATE_LIMIT = 10;
export const TRANSCRIPT_DAILY_QUOTA = 25;
export const TRANSCRIPT_WINDOW_MS = 60_000;
export const TRANSCRIPT_FETCH_TIMEOUT_MS = 15_000;
export const TRANSCRIPT_BUCKETS = ["merged-videos", "user-videos", "wan-frames"] as const;

export class RequestBodyTooLargeError extends Error {}

export async function readBoundedRequestText(request: Request, maxBytes = MAX_REQUEST_BYTES): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestBodyTooLargeError("Request body too large");

  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RequestBodyTooLargeError("Request body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export function parseOwnedTranscriptMedia(raw: string, origin: string, userId: string): OwnedStorageRef | null {
  return parseOwnedStorageRef(raw, origin, userId, TRANSCRIPT_BUCKETS);
}

export function decodedBase64Size(value: string): number {
  const clean = value.includes(",") ? value.slice(value.lastIndexOf(",") + 1) : value;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(clean.length * 3 / 4) - padding);
}
