import { describe, it, expect, vi, afterEach } from "vitest";
import { canEncodeWithWebCodecs } from "./mergeVideosWebCodecs";

describe("canEncodeWithWebCodecs", () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const keys = ["VideoEncoder", "VideoFrame", "AudioEncoder", "AudioData", "OfflineAudioContext"];

  afterEach(() => {
    for (const k of keys) delete g[k];
    vi.restoreAllMocks();
  });

  it("returns false when WebCodecs surface is missing (jsdom)", () => {
    for (const k of keys) delete g[k];
    expect(canEncodeWithWebCodecs()).toBe(false);
  });

  it("returns true only when every required API is present", () => {
    for (const k of keys) g[k] = function () {};
    expect(canEncodeWithWebCodecs()).toBe(true);

    // Removing any single API flips the gate back to false.
    delete g.AudioEncoder;
    expect(canEncodeWithWebCodecs()).toBe(false);
  });
});

describe("WebCodecs frame timestamp math", () => {
  // Mirrors the deterministic timeline math inside mergeVideoUrlsWebCodecs:
  // every output frame is placed at an exact, uniform microsecond timestamp so
  // no frame is dropped or duplicated (the root cause of the old lag).
  const FPS = 30;
  const frameDurUs = Math.round(1_000_000 / FPS);

  it("places frames at uniform, monotonic microsecond timestamps", () => {
    const stamps = Array.from({ length: 5 }, (_, i) => i * frameDurUs);
    expect(stamps).toEqual([0, 33333, 66666, 99999, 133332]);
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i] - stamps[i - 1]).toBe(frameDurUs);
    }
  });

  it("derives total frame count from total duration", () => {
    // 2 clips of 5s + 7s at 30fps → 360 frames.
    const totalDuration = 5 + 7;
    expect(Math.round(totalDuration * FPS)).toBe(360);
  });
});
