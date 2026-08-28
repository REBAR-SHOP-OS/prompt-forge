import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ReactNode } from "react";

// ── Mocks ──────────────────────────────────────────────────────────────────
// We mock usePlayableVideoUrl so we can control resolve/error/reload behavior
// without hitting Supabase. The mock returns a controllable state and tracks
// reload() calls.

const { mockUsePlayableVideoUrl, mockUsePlayableThumbnailUrl } = vi.hoisted(() => ({
  mockUsePlayableVideoUrl: vi.fn(),
  mockUsePlayableThumbnailUrl: vi.fn(),
}));

vi.mock("@/modules/generator-ui/lib/usePlayableVideoUrl", () => ({
  usePlayableVideoUrl: mockUsePlayableVideoUrl,
  usePlayableThumbnailUrl: mockUsePlayableThumbnailUrl,
}));

vi.mock("lucide-react", () => ({
  LoaderCircle: () => <span data-testid="loader" />,
  Clapperboard: () => <span data-testid="clapperboard" />,
  AlertCircle: () => <span data-testid="alert" />,
}));

import { PlayableVideo } from "./PlayableVideo";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeHookState(overrides: Partial<{
  url: string | undefined;
  loading: boolean;
  error: boolean;
  reload: () => void;
}> = {}) {
  const reload = vi.fn();
  return {
    url: undefined,
    loading: false,
    error: false,
    reload,
    ...overrides,
  };
}

function renderPlayable(overrides: Partial<{
  src: string | null | undefined;
  thumbnail?: boolean;
  poster?: string;
  resolvedPoster?: string;
  url: string | undefined;
  loading: boolean;
  error: boolean;
  reload: () => void;
  reloadPoster: () => void;
}> = {}) {
  const {
    src = "merged-videos/user/clip.mp4",
    thumbnail = false,
    poster,
    resolvedPoster,
    url = "https://test.supabase.co/functions/v1/video-proxy?url=xxx&token=***",
    loading = false,
    error = false,
    reload = vi.fn(),
    reloadPoster = vi.fn(),
  } = overrides;

  mockUsePlayableVideoUrl.mockReturnValue({ url, loading, error, reload });
  // usePlayableThumbnailUrl returns { url, reload } so the poster can be
  // re-signed when its signed URL expires mid-session.
  mockUsePlayableThumbnailUrl.mockReturnValue({
    url: resolvedPoster ?? poster,
    reload: reloadPoster,
  });

  const { resolvedPoster: _rp, reloadPoster: _rlp, ...restOverrides } = overrides as Record<string, unknown>;
  return render(
    <PlayableVideo
      src={src}
      thumbnail={thumbnail}
      poster={poster}
      controls
      onError={vi.fn()}
      {...restOverrides}
    />,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("PlayableVideo", () => {
  beforeEach(() => {
    mockUsePlayableVideoUrl.mockReset();
    mockUsePlayableThumbnailUrl.mockReset();
    mockUsePlayableThumbnailUrl.mockReturnValue({ url: undefined, reload: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a loading spinner while resolving (non-thumbnail)", () => {
    renderPlayable({ loading: true, url: undefined });
    expect(screen.getByTestId("loader")).toBeInTheDocument();
  });

  it("renders a <video> with resolved URL on success", () => {
    renderPlayable({ url: "https://test.supabase.co/functions/v1/video-proxy?url=xxx&token=***", loading: false });
    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    expect(video?.getAttribute("src")).toContain("video-proxy");
  });

  it("shows Retry button on resolve failure (non-thumbnail)", () => {
    renderPlayable({ error: true, url: undefined });
    expect(screen.getByRole("button", { name: "Retry loading video" })).toBeInTheDocument();
  });

  it("shows Retry button on resolve failure (thumbnail mode)", () => {
    renderPlayable({ thumbnail: true, error: true, url: undefined });
    expect(screen.getByRole("button", { name: "Retry loading video" })).toBeInTheDocument();
  });

  it("Retry button calls reload() and clears error state", () => {
    const reload = vi.fn();
    // First render: error state
    const { rerender } = renderPlayable({ error: true, url: undefined, reload });

    const retryBtn = screen.getByRole("button", { name: "Retry loading video" });
    fireEvent.click(retryBtn);
    expect(reload).toHaveBeenCalledTimes(1);

    // Simulate hook returning success after reload
    mockUsePlayableVideoUrl.mockReturnValue({
      url: "https://test.supabase.co/functions/v1/video-proxy?url=xxx&token=***",
      loading: false,
      error: false,
      reload,
    });
    rerender(
      <PlayableVideo
        src="merged-videos/user/clip.mp4"
        thumbnail={false}
        controls
        onError={vi.fn()}
      />,
    );
    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    expect(video?.getAttribute("src")).toContain("video-proxy");
  });

  it("renders nothing (placeholder) when src is null", () => {
    renderPlayable({ src: null, url: undefined, loading: false });
    // No video element, no retry button
    expect(document.querySelector("video")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry loading video" })).toBeNull();
  });

  it("plays blob: URLs directly without proxy", () => {
    renderPlayable({ src: "blob:https://example.com/123", url: "blob:https://example.com/123", loading: false });
    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    expect(video?.getAttribute("src")).toBe("blob:https://example.com/123");
  });

  it("uses the re-signed poster URL on the <video> element", () => {
    const signedPoster = "https://test.supabase.co/storage/v1/object/sign/merged-videos/user/thumb.jpg?token=***";
    renderPlayable({ poster: "merged-videos/user/thumb.jpg", resolvedPoster: signedPoster, url: "https://test.supabase.co/functions/v1/video-proxy?url=xxx&token=***", loading: false });
    const video = document.querySelector("video");
    expect(video?.getAttribute("poster")).toBe(signedPoster);
  });

  // A signed poster URL expires after 2h. When the poster <img> fails we must
  // re-sign once so the card is not stuck on a dead image — and exactly once,
  // so a genuinely missing object cannot spin an infinite re-sign loop.
  it("re-signs the poster once when the poster <img> fails to load", () => {
    const reloadPoster = vi.fn();
    const expiredPoster = "https://test.supabase.co/storage/v1/object/sign/merged-videos/user/thumb.jpg?token=expired";
    renderPlayable({
      thumbnail: true,
      poster: "merged-videos/user/thumb.jpg",
      resolvedPoster: expiredPoster,
      reloadPoster,
      url: undefined,
      loading: true,
    });

    const img = document.querySelector("img");
    expect(img).not.toBeNull();

    fireEvent.error(img!);
    expect(reloadPoster).toHaveBeenCalledTimes(1);

    // Second failure on the SAME poster src must not trigger another re-sign.
    fireEvent.error(img!);
    expect(reloadPoster).toHaveBeenCalledTimes(1);
  });

  it("does not attempt a poster re-sign when there is no poster", () => {
    const reloadPoster = vi.fn();
    renderPlayable({ thumbnail: true, reloadPoster, url: undefined, loading: true });
    expect(document.querySelector("img")).toBeNull();
    expect(reloadPoster).not.toHaveBeenCalled();
  });
});