import { useEffect, useRef, useState, type VideoHTMLAttributes } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { usePlayableVideoUrl } from "@/modules/generator-ui/lib/usePlayableVideoUrl";

type Props = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  src: string | null | undefined;
  fallbackClassName?: string;
};

/**
 * Drop-in <video> that routes external URLs through the same-origin
 * video-proxy and renders explicit loading / error states so a card never
 * gets stuck showing a blank player at 0:00 when the underlying media
 * fails to load (expired signed URL, CORS, dead provider, etc).
 *
 * State machine:
 *   resolving  -> resolving the playable URL via usePlayableVideoUrl
 *   loading    -> URL ready, waiting for HTMLVideoElement metadata
 *   ready      -> loadedmetadata fired with a finite duration > 0
 *   error      -> network/decode error OR metadata never arrived in time
 *
 * Controls + native <video> chrome only appear in 'ready' so the user
 * never sees an empty 0:00 timeline for a broken card.
 */
export function PlayableVideo({ src, fallbackClassName, controls, ...rest }: Props) {
  const { url, loading: resolving } = usePlayableVideoUrl(src);
  const [state, setState] = useState<"resolving" | "loading" | "ready" | "error">(
    src ? (resolving || !url ? "resolving" : "loading") : "error",
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const attemptRef = useRef(0);

  // Reset state whenever the resolved URL changes.
  useEffect(() => {
    if (!src) {
      setState("error");
      return;
    }
    if (resolving || !url) {
      setState("resolving");
      return;
    }
    setState("loading");
    attemptRef.current += 1;
    const myAttempt = attemptRef.current;
    // Watchdog: if metadata never arrives within 15s, surface an error
    // instead of leaving a blank 0:00 player on screen.
    const watchdog = window.setTimeout(() => {
      if (attemptRef.current !== myAttempt) return;
      setState((curr) => (curr === "loading" ? "error" : curr));
    }, 15000);
    return () => window.clearTimeout(watchdog);
  }, [src, url, resolving]);

  const handleLoadedMetadata: VideoHTMLAttributes<HTMLVideoElement>["onLoadedMetadata"] = (e) => {
    const el = e.currentTarget;
    const dur = Number.isFinite(el.duration) ? el.duration : 0;
    if (dur > 0 && el.videoWidth > 0 && el.videoHeight > 0) {
      setState("ready");
    } else {
      // Metadata loaded but the file is empty/corrupt — treat as error.
      setState("error");
    }
    rest.onLoadedMetadata?.(e);
  };

  const handleError: VideoHTMLAttributes<HTMLVideoElement>["onError"] = (e) => {
    setState("error");
    rest.onError?.(e);
  };

  const fallback = (icon: React.ReactNode, label?: string) => (
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

  if (state === "resolving" || state === "loading") {
    return (
      <>
        {fallback(<LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />)}
        {/* Mount a hidden <video> so the browser actually loads metadata
            while we show the loader. Once metadata fires, we swap to the
            visible player. */}
        {state === "loading" && url ? (
          <video
            ref={videoRef}
            src={url}
            preload="metadata"
            muted
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            onError={handleError}
            style={{ display: "none" }}
          />
        ) : null}
      </>
    );
  }

  if (state === "error" || !url) {
    return fallback(
      <AlertTriangle className="h-5 w-5 text-zinc-400" aria-hidden="true" />,
      "Video unavailable",
    );
  }

  return (
    <video
      {...rest}
      ref={videoRef}
      src={url}
      controls={controls}
      onLoadedMetadata={handleLoadedMetadata}
      onError={handleError}
    />
  );
}

export default PlayableVideo;
