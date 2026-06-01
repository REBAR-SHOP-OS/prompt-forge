import { describe, it, expect } from "vitest";
import { mimeTypeToExtension } from "./mergeVideos";
import { normalizeCuts, totalKeptDuration } from "./trimVideo";

describe("mergeVideos.mimeTypeToExtension", () => {
  it("maps mp4 mime types to mp4", () => {
    expect(mimeTypeToExtension("video/mp4")).toBe("mp4");
    expect(mimeTypeToExtension("video/mp4;codecs=avc1")).toBe("mp4");
  });

  it("maps webm (and anything else) to webm", () => {
    expect(mimeTypeToExtension("video/webm;codecs=vp9,opus")).toBe("webm");
    expect(mimeTypeToExtension("video/webm")).toBe("webm");
    expect(mimeTypeToExtension("")).toBe("webm");
  });
});

describe("trimVideo cut math (Final Film source trimming)", () => {
  it("clamps and merges overlapping cuts", () => {
    const norm = normalizeCuts(
      [
        { start: -5, end: 2 },
        { start: 1.5, end: 4 },
      ],
      10,
    );
    expect(norm).toEqual([{ start: 0, end: 4 }]);
  });

  it("drops empty / sub-threshold cuts", () => {
    const norm = normalizeCuts([{ start: 3, end: 3.01 }], 10);
    expect(norm).toEqual([]);
  });

  it("computes kept duration after trimming", () => {
    // A 10-minute (600s) clip trimmed down to its first 8 seconds.
    expect(totalKeptDuration([{ start: 8, end: 600 }], 600)).toBeCloseTo(8, 5);
  });

  it("kept duration equals full duration when there are no cuts", () => {
    expect(totalKeptDuration([], 12)).toBe(12);
  });
});
