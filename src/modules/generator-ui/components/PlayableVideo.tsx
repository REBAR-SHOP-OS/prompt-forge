import { useRef, useState, type ReactNode, type VideoHTMLAttributes } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { usePlayableVideoUrl } from "@/modules/generator-ui/lib/usePlayableVideoUrl";

type Props = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  src: string | null | undefined;
  fallbackClassName?: string;
};

/**
 * Drop-in <video> that routes external URLs through the same-origin
 * video-proxy. Renders the real <video> element as soon as we have a
 * CORS-safe URL — the browser's own poster / loading behavior covers
 * the load window. We only show "Video unavailable" on an explicit
 * <video> onError, never on a metadata timeout, because the proxy
 * stream from Aliyun OSS can take many seconds and racing it with a
 * watchdog produced false negatives (cards stuck on "Video
 * unavailable" while the same URL played fine elsewhere).
 */
export function PlayableVideo({ src, fallbackClassName, controls, poster, ...rest }: Props) {
  const { url, loading: resolving } = usePlayableVideoUrl(src);
  const [errored, setErrored] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleLoadedMetadata: VideoHTMLAttributes<HTMLVideoElement>["onLoadedMetadata"] = (e) => {
    // Clear any stale error from a previous src if metadata now arrives.
    if (errored) setErrored(false);
    rest.onLoadedMetadata?.(e);
  };

  const handleError: VideoHTMLAttributes<HTMLVideoElement>["onError"] = (e) => {
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

  if (!src) {
    return fallback(<AlertTriangle className="h-5 w-5 text-zinc-400" aria-hidden="true" />, "Video unavailable");
  }

  if (resolving || !url) {
    return fallback(<LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />);
  }

  if (errored) {
    return fallback(<AlertTriangle className="h-5 w-5 text-zinc-400" aria-hidden="true" />, "Video unavailable");
  }

  return (
    <video
      {...rest}
      ref={videoRef}
      src={url}
      poster={poster}
      controls={controls}
      onLoadedMetadata={handleLoadedMetadata}
      onError={handleError}
    />
  );
}

export default PlayableVideo;
