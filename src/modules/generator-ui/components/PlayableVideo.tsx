import { useEffect, useRef, useState, type VideoHTMLAttributes } from "react";
import { LoaderCircle, Clapperboard } from "lucide-react";
import { usePlayableVideoUrl } from "@/modules/generator-ui/lib/usePlayableVideoUrl";

type Props = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  src: string | null | undefined;
  fallbackClassName?: string;
  /**
   * Thumbnail/card mode. When true the component renders a STABLE container:
   * the poster (or a neutral surface) stays mounted in place the whole time
   * and the <video> fades in on top once its first frame is painted. This
   * eliminates the gray/black flicker that happened when the placeholder DOM
   * node was swapped out for a fresh <video> node mid-load.
   */
  thumbnail?: boolean;
};

const MAX_RETRIES = 3;

/**
 * Drop-in <video> that routes URLs through the same-origin video-proxy.
 *
 * Resilience model:
 *   - On <video> error, retry up to MAX_RETRIES with a cache-busting query
 *     string. This recovers from transient first-byte/range failures.
 *   - After retries are exhausted we NEVER render a noisy "Video unavailable"
 *     warning card. Instead we keep the card looking intact by showing the
 *     poster image (if one exists) or a neutral dark surface. The card UI
 *     itself surfaces real failures via job status — the video tile should
 *     never become a giant error placeholder.
 *   - While resolving, a quiet loader is shown.
 *
 * Flicker model (thumbnail mode):
 *   - The poster/placeholder layer is mounted once and never unmounted, so
 *     there is no DOM swap when the resolved URL arrives.
 *   - The <video> overlays the poster with opacity 0 and fades to 1 only
 *     after `loadeddata` (first frame painted), so the card never flashes a
 *     blank/gray surface between poster and video.
 */
export function PlayableVideo({ src, fallbackClassName, controls, poster, thumbnail, ...rest }: Props) {
  const { url, loading: resolving, reload } = usePlayableVideoUrl(src);
  const [errored, setErrored] = useState(false);
  const [painted, setPainted] = useState(false);
  const retriesRef = useRef(0);
  const reloadedRef = useRef(false);
  const [retryToken, setRetryToken] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Reset retry/paint state only when the SOURCE changes (a genuinely new clip).
  // Keying this on `src` instead of the resolved `url` is critical: our own
  // recovery path calls reload(), which changes `url` for the SAME `src`. If we
  // reset on every `url` change, the retry + reload budget would be wiped after
  // each reload, producing an infinite error -> retry(×3) -> reload -> repeat
  // loop that remounts the <video> forever and freezes the page (especially
  // inside the Rebar OS iframe, where private merged-videos URLs can fail).
  useEffect(() => {
    retriesRef.current = 0;
    reloadedRef.current = false;
    setErrored(false);
    setRetryToken(0);
    setPainted(false);
  }, [src]);

  const handleLoadedMetadata: VideoHTMLAttributes<HTMLVideoElement>["onLoadedMetadata"] = (e) => {
    if (errored) setErrored(false);
    retriesRef.current = 0;
    const el = e.currentTarget;
    // Let the consumer run first (it may seek to a preview frame).
    rest.onLoadedMetadata?.(e);

    // If the consumer requested a seek (or one is already in flight), the
    // browser will paint that frame on its own — kicking play()/pause() on
    // top of it causes a visible flicker (the clip briefly plays, then jumps
    // back to the seeked frame). So only force a paint when there is NO
    // poster AND no seek is happening. A poster already covers the first
    // paint, so no kick is needed there either.
    const seekRequested = el.seeking || el.currentTime > 0;
    if (poster || seekRequested) return;

    // No poster and no seek: some browsers (Chromium) won't paint the first
    // frame of a muted <video> until play() is called. Briefly kick playback
    // once to force a visible first frame, then pause.
    const kick = () => {
      const p = el.play();
      if (p && typeof p.then === "function") {
        p.then(() => { try { el.pause(); } catch { /* ignore */ } }).catch(() => { /* ignore */ });
      }
    };
    kick();
  };

  const handleLoadedData: VideoHTMLAttributes<HTMLVideoElement>["onLoadedData"] = (e) => {
    setPainted(true);
    rest.onLoadedData?.(e);
  };

  const handleError: VideoHTMLAttributes<HTMLVideoElement>["onError"] = (e) => {
    if (retriesRef.current < MAX_RETRIES) {
      retriesRef.current += 1;
      setRetryToken((n) => n + 1);
      return;
    }
    // Retries on the same URL are exhausted. If the resolved URL was a
    // token-bearing proxy URL, the token may have expired — drop it from the
    // cache and re-resolve once with a fresh token before giving up. This is
    // what lets a card recover after the tab has been open a while or after a
    // sign-out/in, instead of staying blank forever.
    if (!reloadedRef.current && src) {
      reloadedRef.current = true;
      reload();
      return;
    }
    setErrored(true);
    rest.onError?.(e);
  };

  // Neutral, quiet placeholder — never shows the "Video unavailable" text and
  // never leaves a fully blank/black card. Without a poster we paint a small
  // film icon so a card whose source can't be played still reads as a clip,
  // not an empty mystery box.
  const quietPlaceholder = (showLoader: boolean) => {
    if (poster) {
      return (
        <div className={fallbackClassName ?? "h-full w-full bg-black"}>
          <img src={poster} alt="" className="h-full w-full object-cover" />
        </div>
      );
    }
    return (
      <div
        className={
          fallbackClassName ??
          "grid h-full w-full place-items-center bg-[#15171a] text-zinc-500"
        }
        role="presentation"
      >
        {showLoader ? (
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <Clapperboard className="h-6 w-6 opacity-70" aria-hidden="true" />
        )}
      </div>
    );
  };

  // ---- Thumbnail/card mode: stable, flicker-free layered render. ----
  // The poster/placeholder layer is always mounted; the <video> fades in on
  // top once it has painted a frame. No node is ever swapped mid-load.
  if (thumbnail) {
    const showVideo = !!src && !resolving && !!url && !errored;
    const playUrl =
      showVideo && retryToken > 0
        ? `${url}${url.includes("?") ? "&" : "?"}_r=${retryToken}`
        : url;
    const { className, ...videoRest } = rest;
    return (
      <div className="relative h-full w-full overflow-hidden">
        <div className="absolute inset-0">
          {quietPlaceholder(!src ? false : resolving || (!painted && !errored))}
        </div>
        {showVideo ? (
          <video
            {...videoRest}
            key={retryToken}
            ref={videoRef}
            src={playUrl}
            poster={poster}
            controls={controls}
            onLoadedMetadata={handleLoadedMetadata}
            onLoadedData={handleLoadedData}
            onError={handleError}
            className={`${className ?? ""} absolute inset-0 transition-opacity duration-200 ${
              painted ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : null}
      </div>
    );
  }

  if (!src) return quietPlaceholder(false);
  if (resolving || !url) return quietPlaceholder(true);
  if (errored) return quietPlaceholder(false);

  // Cache-bust on retry so the browser re-issues the request.
  const playUrl = retryToken > 0
    ? `${url}${url.includes("?") ? "&" : "?"}_r=${retryToken}`
    : url;

  return (
    <video
      {...rest}
      key={retryToken}
      ref={videoRef}
      src={playUrl}
      poster={poster}
      controls={controls}
      onLoadedMetadata={handleLoadedMetadata}
      onError={handleError}
    />
  );
}

export default PlayableVideo;
