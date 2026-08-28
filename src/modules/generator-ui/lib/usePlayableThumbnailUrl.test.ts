import { renderHook, waitFor } from "@testing-library/react";

// Mock supabase before importing the module under test.
const { mockCreateSignedUrl } = vi.hoisted(() => ({
  mockCreateSignedUrl: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({ createSignedUrl: mockCreateSignedUrl })),
    },
    auth: { getSession: vi.fn() },
  },
}));

vi.mock("@/core/api/client", () => ({
  FUNCTIONS_BASE: "https://test.supabase.co/functions/v1",
}));

import { usePlayableThumbnailUrl } from "./usePlayableVideoUrl";

// Each test uses a distinct src so the module-level thumbnail cache (which has
// no public invalidator by design) cannot leak between cases.
let n = 0;
const uniquePath = () => `merged-videos/user/poster-${++n}.png`;

describe("usePlayableThumbnailUrl", () => {
  beforeEach(() => {
    mockCreateSignedUrl.mockReset();
  });

  it("passes blob: and data: sources straight through without signing", async () => {
    const blob = "blob:https://app.example.com/abc";
    const { result } = renderHook(() => usePlayableThumbnailUrl(blob));
    expect(result.current).toBe(blob);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it("signs a bucket-relative private-bucket path", async () => {
    const src = uniquePath();
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/x?token=***" },
      error: null,
    });

    const { result } = renderHook(() => usePlayableThumbnailUrl(src));

    await waitFor(() =>
      expect(result.current).toBe(
        "https://test.supabase.co/storage/v1/object/sign/x?token=***",
      ),
    );
  });

  it("fails closed to undefined when signing fails", async () => {
    const src = uniquePath();
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: new Error("denied") });

    const { result } = renderHook(() => usePlayableThumbnailUrl(src));

    // Resolution is async; give the effect a chance to settle, then assert it
    // stayed undefined rather than falling back to the unsigned path.
    await waitFor(() => expect(mockCreateSignedUrl).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });

  it("returns undefined for a null/empty source", () => {
    const { result } = renderHook(() => usePlayableThumbnailUrl(null));
    expect(result.current).toBeUndefined();
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it("caches a successful resolution so a second mount does not re-sign", async () => {
    const src = uniquePath();
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://test.supabase.co/storage/v1/object/sign/cached?token=***" },
      error: null,
    });

    const first = renderHook(() => usePlayableThumbnailUrl(src));
    await waitFor(() => expect(first.result.current).toBeDefined());
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);

    const second = renderHook(() => usePlayableThumbnailUrl(src));
    expect(second.result.current).toBe(
      "https://test.supabase.co/storage/v1/object/sign/cached?token=***",
    );
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("leaves an external URL untouched", async () => {
    const src = "https://external.example.com/poster.png";
    const { result } = renderHook(() => usePlayableThumbnailUrl(src));
    await waitFor(() => expect(result.current).toBe(src));
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it("leaves a root-relative asset path untouched", async () => {
    const src = "/assets/poster.png";
    const { result } = renderHook(() => usePlayableThumbnailUrl(src));
    await waitFor(() => expect(result.current).toBe(src));
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });
});
