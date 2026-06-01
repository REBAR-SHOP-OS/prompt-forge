import { useEffect, useRef, useState, type VideoHTMLAttributes } from "react";
import { LoaderCircle, Clapperboard } from "lucide-react";
import { usePlayableVideoUrl } from "@/modules/generator-ui/lib/usePlayableVideoUrl";

type Props = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  src: string | null | undefined;
  fallbackClassName?: string;
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
 */
export function PlayableVideo({ src, fallbackClassName, controls, poster, ...rest }: Props) {
  const { url, loading: resolving, reload } = usePlayableVideoUrl(src);
  const [errored, setErrored] = useState(false);
  const retriesRef = useRef(0);
  const reloadedRef = useRef(false);
  const [retryToken, setRetryToken] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Reset retry state every time the resolved URL changes.
  useEffect(() => {
    retriesRef.current = 0;
    reloadedRef.current = false;
    setErrored(false);
    setRetryToken(0);
  }, [url]);

  const handleLoadedMetadata: VideoHTMLAttributes<HTMLVideoElement>["onLoadedMetadata"] = (e) => {
    if (errored) setErrored(false);
    retriesRef.current = 0;
    rest.onLoadedMetadata?.(e);
    // When there's no poster, some browsers (Chromium) won't paint the
    // seeked frame for a muted <video> until play() is called. Briefly
    // kick playback to force a visible first frame, then pause.
    if (!poster) {
      const el = e.currentTarget;
      const kick = () => {
        const p = el.play();
        if (p && typeof p.then === "function") {
          p.then(() => { try { el.pause(); } catch { /* ignore */ } }).catch(() => { /* ignore */ });
        }
      };
      // Wait for the post-seek frame if a seek was requested in user handler.
      if (el.seeking) {
        const onSeeked = () => { el.removeEventListener("seeked", onSeeked); kick(); };
        el.addEventListener("seeked", onSeeked);
      } else {
        kick();
      }
    }
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
