import { type VideoHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { usePlayableVideoUrl } from "@/modules/generator-ui/lib/usePlayableVideoUrl";

type Props = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src"> & {
  src: string | null | undefined;
  fallbackClassName?: string;
};

/**
 * Drop-in <video> that routes external URLs through the same-origin
 * video-proxy, so cards never render a blank/grey player when the
 * provider URL is CORS-blocked or expired.
 */
export function PlayableVideo({ src, fallbackClassName, ...rest }: Props) {
  const { url, loading } = usePlayableVideoUrl(src);

  if (loading) {
    return (
      <div
        className={
          fallbackClassName ??
          "grid h-full w-full place-items-center bg-[#15171a] text-zinc-500"
        }
      >
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return <video {...rest} src={url} />;
}

export default PlayableVideo;
