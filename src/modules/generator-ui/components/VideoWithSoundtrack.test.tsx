import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────

const { mockUsePlayableVideoUrl } = vi.hoisted(() => ({
  mockUsePlayableVideoUrl: vi.fn(),
}));

vi.mock("@/modules/generator-ui/lib/usePlayableVideoUrl", () => ({
  usePlayableVideoUrl: mockUsePlayableVideoUrl,
}));

vi.mock("@/modules/generator-ui/components/PreviewSoundtrackWaveforms", () => ({
  PreviewSoundtrackWaveforms: vi.fn(() => null),
}));

vi.mock("lucide-react", () => ({
  LoaderCircle: () => <span data-testid="loader" />,
  AlertCircle: () => <span data-testid="alert" />,
}));

import { VideoWithSoundtrack } from "./VideoWithSoundtrack";
import { PreviewSoundtrackWaveforms } from "./PreviewSoundtrackWaveforms";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<{
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

function renderVWS(overrides: Partial<{
  src: string;
  url: string | undefined;
  loading: boolean;
  error: boolean;
  reload: () => void;
}> = {}) {
  const {
    src = "merged-videos/user/clip.mp4",
    url = "https://test.supabase.co/functions/v1/video-proxy?url=xxx&token=***",
    loading = false,
    error = false,
    reload = vi.fn(),
  } = overrides;

  mockUsePlayableVideoUrl.mockReturnValue({ url, loading, error, reload });

  return render(
    <VideoWithSoundtrack
      src={src}
      clipVolume={1}
      onError={vi.fn()}
    />,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("VideoWithSoundtrack", () => {
  beforeEach(() => {
    mockUsePlayableVideoUrl.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a loading spinner while resolving", () => {
    renderVWS({ loading: true, url: undefined });
    expect(screen.getByTestId("loader")).toBeInTheDocument();
  });

  it("renders a <video> with resolved URL on success", () => {
    renderVWS({ url: "https://test.supabase.co/functions/v1/video-proxy?url=xxx&token=***", loading: false });
    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    expect(video?.getAttribute("src")).toContain("video-proxy");
  });

  it("forwards music fade durations to the live soundtrack preview", () => {
    mockUsePlayableVideoUrl.mockReturnValue({
      url: "https://test.supabase.co/video-proxy?token=***",
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    render(
      <VideoWithSoundtrack
        src="merged-videos/user/clip.mp4"
        musicUrl="blob:music"
        musicFadeInSec={1.5}
        musicFadeOutSec={2.5}
      />,
    );
    const props = vi.mocked(PreviewSoundtrackWaveforms).mock.calls.at(-1)?.[0];
    expect(props).toEqual(expect.objectContaining({
      musicFadeInSec: 1.5,
      musicFadeOutSec: 2.5,
    }));
  });

  it("shows Retry button on resolve failure", () => {
    renderVWS({ error: true, url: undefined });
    expect(screen.getByRole("button", { name: "Retry loading video" })).toBeInTheDocument();
  });

  it("shows Retry button after playback failure exhaustion (retries + reload)", () => {
    // Render with a resolved URL so the <video> is mounted
    const reload = vi.fn();
    const { container } = renderVWS({ url: "https://test.supabase.co/video-proxy?token=***", reload });

    // Each retry increments `retryToken`, which remounts the <video> via its
    // `key`. Re-query the live element before every error so we always fire on
    // the currently-mounted node.
    const liveVideo = () => container.querySelector("video");
    expect(liveVideo()).toBeTruthy();

    // Errors 1-3: retry budget (MAX_RETRIES=3) → each remounts the video.
    act(() => {
      for (let i = 0; i < 3; i++) {
        fireEvent.error(liveVideo()!);
      }
    });
    expect(reload).not.toHaveBeenCalled();

    // Error 4: retries exhausted → one re-resolve via reload().
    act(() => {
      fireEvent.error(liveVideo()!);
    });
    expect(reload).toHaveBeenCalledTimes(1);

    // Error 5: reload already attempted → final failure UI.
    act(() => {
      fireEvent.error(liveVideo()!);
    });

    expect(screen.getByRole("button", { name: "Retry loading video" })).toBeInTheDocument();
  });

  it("Retry button calls reload() and resets state", () => {
    const reload = vi.fn();
    renderVWS({ error: true, url: undefined, reload });

    const retryBtn = screen.getByRole("button", { name: "Retry loading video" });
    fireEvent.click(retryBtn);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("onLoadedMetadata clears playbackError and resets retry budget", () => {
    const reload = vi.fn();
    const { container } = renderVWS({ url: "https://test.supabase.co/video-proxy?token=***", reload });

    const video = container.querySelector("video");
    expect(video).toBeTruthy();

    // Trigger some errors to build up retry count
    act(() => {
      fireEvent.error(video!);
      fireEvent.error(video!);
    });

    // Now a successful metadata load should reset everything
    act(() => {
      fireEvent.loadedMetadata(video!);
    });

    // Video should still be present (no error UI)
    expect(container.querySelector("video")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry loading video" })).toBeNull();
  });
});
