import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/functions/film-preview-quality/index.ts", "utf8");

describe("film-preview-quality endpoint safeguards", () => {
  it("authenticates before fetching and only accepts the user's wan-frames image", () => {
    expect(source.indexOf("await authenticate(req)")).toBeGreaterThan(-1);
    expect(source.indexOf("await authenticate(req)")).toBeLessThan(source.indexOf("await fetch(imageUrl"));
    expect(source).toContain('path.includes("/wan-frames/")');
    expect(source).toContain('path.includes(`/${userId}/`)');
    expect(source).toContain('candidate.hostname === project.hostname');
  });

  it("bounds the actual image read and sends image bytes to Gemini", () => {
    expect(source).toContain("MAX_IMAGE_BYTES = 10 * 1024 * 1024");
    expect(source).toContain("FETCH_TIMEOUT_MS = 30_000");
    expect(source).toContain('mimeType.startsWith("image/")');
    expect(source).toContain("imageDataUrl = `data:${mimeType};base64,${toBase64(bytes)}`");
    expect(source).toContain('"https://ai.gateway.lovable.dev/v1/chat/completions"');
    expect(source).toContain('"google/gemini-3-flash-preview"');
  });

  it("fails closed when the evaluator response cannot be validated", () => {
    expect(source).toContain("parsePreviewShotQualityResponse(raw.trim())");
    expect(source).toContain("Preview quality evaluator returned an invalid response");
  });
});
