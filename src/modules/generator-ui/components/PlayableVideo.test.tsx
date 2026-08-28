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
  } = overrides;

  mockUsePlayableVideoUrl.mockReturnValue({ url, loading, error, reload });
  mockUsePlayableThumbnailUrl.mockReturnValue(resolvedPoster ?? poster);

  const { resolvedPoster: _rp, ...restOverrides } = overrides as Record<string, unknown>;
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
    mockUsePlayableThumbnailUrl.mockReturnValue(undefined);
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
});