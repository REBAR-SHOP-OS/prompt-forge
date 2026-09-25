import { describe, expect, it } from "vitest";
import {
  bytesToBase64,
  ImageTooLargeError,
  readBoundedBytes,
} from "../supabase/functions/film-preview-quality/image";

function streamResponse(chunks: Uint8Array[]): Response {
  let i = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
  }));
}

describe("film-preview-quality image helpers", () => {
  it("encodes large multi-chunk images identically to Buffer base64", () => {
    const bytes = new Uint8Array(3 * 1024 * 1024 + 7);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff;
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    expect(bytesToBase64(new Uint8Array(0))).toBe("");
  });

  it("encodes a 10 MB image quickly (no per-byte JS arrays)", () => {
    const bytes = new Uint8Array(10 * 1024 * 1024).fill(200);
    const start = performance.now();
    bytesToBase64(bytes);
    expect(performance.now() - start).toBeLessThan(1500);
  });

  it("reads a bounded body and stops as soon as the cap is exceeded", async () => {
    const ok = await readBoundedBytes(streamResponse([new Uint8Array([1, 2]), new Uint8Array([3])]), 3);
    expect(Array.from(ok)).toEqual([1, 2, 3]);
    await expect(
      readBoundedBytes(streamResponse([new Uint8Array(3), new Uint8Array(2)]), 4),
    ).rejects.toBeInstanceOf(ImageTooLargeError);
  });
});
