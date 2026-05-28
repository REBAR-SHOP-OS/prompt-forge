import { useEffect, useRef, useState, type ReactNode, type VideoHTMLAttributes } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { usePlayableVideoUrl } from "@/modules/generator-ui/lib/usePlayableVideoUrl";

type Props = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  src: string | null | undefined;
  fallbackClassName?: string;
};

const MAX_RETRIES = 2;

/**
 * Drop-in <video> that routes URLs through the same-origin video-proxy.
 *
 * Resilience model:
 *   - A single <video> onError no longer permanently marks the card as
 *     unavailable. We retry up to MAX_RETRIES times with a cache-busting
 *     query string, because the most common cause of the old "Video
 *     unavailable" flicker was a transient first-byte/range failure on
 *     the very first attempt — re-mounting the element with a fresh URL
 *     recovers cleanly without the user ever seeing the broken state.
 *   - Only after we've exhausted retries do we show the poster (if any)
 *     or the warning fallback.
 *   - Whenever the resolved URL changes (new src, new session), retry
 *     count + error state are reset so a card that briefly failed can
 *     recover on its next render.
 */
export function PlayableVideo({ src, fallbackClassName, controls, poster, ...rest }: Props) {
  const { url, loading: resolving } = usePlayableVideoUrl(src);
  const [errored, setErrored] = useState(false);
  const retriesRef = useRef(0);
  const [retryToken, setRetryToken] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Reset retry state every time the resolved URL changes.
  useEffect(() => {
    retriesRef.current = 0;
    setErrored(false);
    setRetryToken(0);
  }, [url]);

  const handleLoadedMetadata: VideoHTMLAttributes<HTMLVideoElement>["onLoadedMetadata"] = (e) => {
    // Successful load — clear any prior error state.
    if (errored) setErrored(false);
    retriesRef.current = 0;
    rest.onLoadedMetadata?.(e);
  };

  const handleError: VideoHTMLAttributes<HTMLVideoElement>["onError"] = (e) => {
    if (retriesRef.current < MAX_RETRIES) {
      retriesRef.current += 1;
      // Re-mount with a cache-busting token so the browser re-issues the
      // request from scratch instead of reusing the failed response.
      setRetryToken((n) => n + 1);
      return;
    }
    setErrored(true);
    rest.onError?.(e);
  };

  const fallback = (icon: ReactNode, label?: string) => (
    <div
      className={
        fallbackClassName ??
        "grid h-full w-full place-items-center bg-[#15171a] text-zinc-500"
      }
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-1.5 text-xs">
        {icon}
        {label ? <span>{label}</span> : null}
      </div>
    </div>
  );

  // Prefer the poster image when one is available — keeps the card
  // looking intact even if the stream momentarily fails.
  const posterFallback = (label?: string) => {
    if (poster) {
      return (
        <div className={fallbackClassName ?? "h-full w-full bg-black"}>
          <img src={poster} alt={label ?? ""} className="h-full w-full object-cover" />
        </div>
      );
    }
    return fallback(<AlertTriangle className="h-5 w-5 text-zinc-400" aria-hidden="true" />, label);
  };

  if (!src) return posterFallback("Video unavailable");
  if (resolving || !url) return fallback(<LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />);
  if (errored) return posterFallback("Video unavailable");

  // Cache-bust the URL on retry so the browser doesn't reuse the failed
  // response. The proxy ignores unknown query params, so this is safe.
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
