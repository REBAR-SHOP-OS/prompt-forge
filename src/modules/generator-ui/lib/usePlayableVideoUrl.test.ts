import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock supabase before importing the module under test.
const { mockCreateSignedUrl, mockGetSession } = vi.hoisted(() => ({
  mockCreateSignedUrl: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
    auth: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock("@/core/api/client", () => ({
  FUNCTIONS_BASE: "https://test.supabase.co/functions/v1",
}));

import { usePlayableVideoUrl, usePlayableVideoUrls, usePlayableThumbnailUrl, invalidatePlayableVideoUrl, invalidatePlayableThumbnailUrl } from "./usePlayableVideoUrl";

describe("usePlayableVideoUrl", () => {
  beforeEach(() => {
    mockCreateSignedUrl.mockReset();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "***" } },
    });
    // Clear the module-level cache between tests
    invalidatePlayableVideoUrl("merged-videos/user/file.mp4");
    invalidatePlayableVideoUrl("https://test.supabase.co/storage/v1/object/public/merged-videos/user/file.mp4");
    invalidatePlayableVideoUrl("https://external.example.com/video.mp4");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns blob: URLs immediately without resolving", () => {
    const { result } = renderHook(() => usePlayableVideoUrl("blob:https://example.com/123"));
    expect(result.current.url).toBe("blob:https://example.com/123");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
  });

  it("returns data: URLs immediately without resolving", () => {
    const { result } = renderHook(() => usePlayableVideoUrl("data:image/png;base64,iVBORw0KGgo="));
    expect(result.current.url).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(result.current.loading).toBe(false);
  });

  it("returns undefined url and loading=true while resolving", () => {
    mockCreateSignedUrl.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => usePlayableVideoUrl("merged-videos/user/file.mp4"));
    expect(result.current.url).toBeUndefined();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(false);
  });

  it("exposes error=true when resolution fails (fail-closed, no raw URL)", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "not authorized" },
    });
    const { result } = renderHook(() => usePlayableVideoUrl("merged-videos/user/file.mp4"));
    // Wait for the promise to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.error).toBe(true);
    expect(result.current.url).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  it("does NOT cache failures — reload() re-attempts with fresh tokens", async () => {
    // First attempt: fail
    mockCreateSignedUrl.mockResolvedValueOnce({
      data: null,
      error: { message: "not authorized" },
    });
    const { result } = renderHook(() => usePlayableVideoUrl("merged-videos/user/file.mp4"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.error).toBe(true);

    // Second attempt: succeed
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/merged-videos/user/file.mp4?token=***" },
      error: null,
    });
    act(() => {
      result.current.reload();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.error).toBe(false);
    expect(result.current.url).toBeDefined();
    expect(result.current.url).toContain("video-proxy");
  });

  it("caches successful resolutions for subsequent calls with same src", async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/merged-videos/user/file.mp4?token=***" },
      error: null,
    });
    const { result: r1 } = renderHook(() => usePlayableVideoUrl("merged-videos/user/file2.mp4"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(r1.current.url).toContain("video-proxy");

    // Second hook with same src should get cached result instantly
    mockCreateSignedUrl.mockClear();
    const { result: r2 } = renderHook(() => usePlayableVideoUrl("merged-videos/user/file2.mp4"));
    expect(r2.current.url).toContain("video-proxy");
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });
});

const SIGN_BASE =
  "https://test.supabase.co/storage/v1/object/sign/merged-videos/user/thumb.jpg?token=";

describe("usePlayableThumbnailUrl", () => {
  beforeEach(() => {
    mockCreateSignedUrl.mockReset();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "***" } },
    });
    invalidatePlayableThumbnailUrl("merged-videos/user/thumb.jpg");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("re-signs an expired thumbnail cache entry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-28T12:00:00Z"));

    // Distinct token per call so "was it re-signed?" is observable.
    let sig = 0;
    mockCreateSignedUrl.mockImplementation(() => {
      sig += 1;
      return Promise.resolve({
        data: { signedUrl: `${SIGN_BASE}sig${sig}` },
        error: null,
      });
    });
    const { result } = renderHook(() => usePlayableThumbnailUrl("merged-videos/user/thumb.jpg"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    const firstUrl = result.current.url;
    expect(firstUrl).toContain("object/sign");

    // Advance past THUMBNAIL_TTL_MS (signed TTL - 5 min) so the entry is stale.
    await act(async () => {
      vi.setSystemTime(new Date("2026-08-28T14:00:00Z")); // +2h
    });

    // A fresh hook with the same src must re-sign (not return the stale URL).
    const { result: r2 } = renderHook(() => usePlayableThumbnailUrl("merged-videos/user/thumb.jpg"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(r2.current.url).not.toBe(firstUrl);
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("reload() re-signs after invalidation", async () => {
    let sig = 0;
    mockCreateSignedUrl.mockImplementation(() => {
      sig += 1;
      return Promise.resolve({
        data: { signedUrl: `${SIGN_BASE}sig${sig}` },
        error: null,
      });
    });
    const { result } = renderHook(() => usePlayableThumbnailUrl("merged-videos/user/thumb.jpg"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const firstUrl = result.current.url;
    expect(firstUrl).toContain("object/sign");

    act(() => {
      result.current.reload();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.url).not.toBe(firstUrl);
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(2);
  });

});

describe("usePlayableVideoUrls (batch)", () => {
  beforeEach(() => {
    mockCreateSignedUrl.mockReset();
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "***" } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never returns raw source on failure — returns undefined + errors array", async () => {
    // First src succeeds, second fails, third is null
    mockCreateSignedUrl
      .mockResolvedValueOnce({
        data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/merged-videos/user/good.mp4?token=***" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "not authorized" },
      });

    const { result } = renderHook(() =>
      usePlayableVideoUrls([
        "merged-videos/user/good.mp4",
        "merged-videos/user/bad.mp4",
        null,
      ]),
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.urls[0]).toContain("video-proxy");
    expect(result.current.urls[1]).toBeUndefined(); // NOT the raw source
    expect(result.current.urls[2]).toBeUndefined();
    expect(result.current.errors[0]).toBe(false);
    expect(result.current.errors[1]).toBe(true);
    expect(result.current.errors[2]).toBe(false);
  });

  it("returns blob: URLs unchanged in batch mode", async () => {
    const { result } = renderHook(() =>
      usePlayableVideoUrls(["blob:https://example.com/123", null]),
    );
    expect(result.current.urls[0]).toBe("blob:https://example.com/123");
    expect(result.current.urls[1]).toBeUndefined();
  });
});