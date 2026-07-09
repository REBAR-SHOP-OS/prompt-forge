import { useEffect, useRef, useState, type CSSProperties, type VideoHTMLAttributes } from 'react'
import { LoaderCircle } from 'lucide-react'
import { usePlayableVideoUrl } from '@/modules/generator-ui/lib/usePlayableVideoUrl'
import {
  PreviewSoundtrackWaveforms,
  type PreviewSoundtrackHandle,
} from '@/modules/generator-ui/components/PreviewSoundtrackWaveforms'

type VideoBaseProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src' | 'muted'>

export interface VideoWithSoundtrackProps extends VideoBaseProps {
  src: string
  videoKey?: string
  clipVolume?: number
  musicUrl?: string | null
  musicRange?: [number, number]
  musicVolume?: number
  musicTimeline?: [number, number]
  voiceoverUrl?: string | null
  voiceoverVolume?: number
  voiceoverRange?: [number, number]
  voiceoverTimeline?: [number, number]
  /** Styling for the video's aspect-ratio box (the area that holds the <video>). */
  videoBoxClassName?: string
  videoBoxStyle?: CSSProperties
}

/**
 * A <video> element that automatically synchronises a music track and a
 * voiceover track with the video's playback state. The tracks are rendered as
 * waveforms underneath the video and are driven entirely by the video element,
 * so the audio stays locked to the picture and can never play separately.
 */
export function VideoWithSoundtrack({
  src,
  videoKey,
  clipVolume = 1,
  musicUrl,
  musicRange,
  musicVolume = 1,
  musicTimeline,
  voiceoverUrl,
  voiceoverVolume = 1,
  voiceoverRange,
  voiceoverTimeline,
  videoBoxClassName,
  videoBoxStyle,
  ...videoProps
}: VideoWithSoundtrackProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const soundtrackRef = useRef<PreviewSoundtrackHandle | null>(null)

  // Apply clip volume / mute to the video element.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume = Math.max(0, Math.min(1, clipVolume))
    v.muted = clipVolume <= 0
  }, [clipVolume])

  // Sync the soundtrack waveforms with the video's play / pause / seek / end.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onPlay = () => soundtrackRef.current?.play()
    const onPause = () => soundtrackRef.current?.pause()
    const onEnded = () => soundtrackRef.current?.pause()
    const onSeeking = () => soundtrackRef.current?.handleSeek(v.currentTime)
    const onSeeked = () => soundtrackRef.current?.handleSeek(v.currentTime)
    const onTimeUpdate = () => soundtrackRef.current?.syncTime(v.currentTime)

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onEnded)
    v.addEventListener('seeking', onSeeking)
    v.addEventListener('seeked', onSeeked)
    v.addEventListener('timeupdate', onTimeUpdate)

    // If video is already playing when this effect re-runs (e.g. soundtrack URL
    // changed while playing), restart the audios in sync.
    if (!v.paused && !v.ended) soundtrackRef.current?.play()

    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onEnded)
      v.removeEventListener('seeking', onSeeking)
      v.removeEventListener('seeked', onSeeked)
      v.removeEventListener('timeupdate', onTimeUpdate)
    }
  }, [musicUrl, voiceoverUrl])

  const { className: videoClassName, style: videoStyle, ...restVideoProps } = videoProps

  const { url: resolvedSrc, loading: srcLoading, reload } = usePlayableVideoUrl(src)

  // ---- Expired-token / transient-error recovery (mirrors PlayableVideo). ----
  // The resolved URL for private buckets is a video-proxy URL with embedded
  // short-lived tokens (signed storage URL + user access token). When the tab
  // stays open past expiry, metadata may already be buffered but any further
  // byte-range request fails: the <video> fires 'error' and, without recovery,
  // the play button silently does nothing forever. Retry with a cache-buster,
  // then re-resolve the URL once with fresh tokens.
  const MAX_RETRIES = 3
  const retriesRef = useRef(0)
  const reloadedRef = useRef(false)
  const [retryToken, setRetryToken] = useState(0)

  // Reset the retry/reload budget only when the SOURCE truly changes —
  // reload() changes `resolvedSrc` for the same `src` and must not reset it
  // (see PlayableVideo for the infinite-loop failure mode this prevents).
  useEffect(() => {
    retriesRef.current = 0
    reloadedRef.current = false
    setRetryToken(0)
  }, [src])

  const handleVideoError: VideoHTMLAttributes<HTMLVideoElement>['onError'] = (e) => {
    if (retriesRef.current < MAX_RETRIES) {
      retriesRef.current += 1
      setRetryToken((n) => n + 1)
      return
    }
    if (!reloadedRef.current && src) {
      reloadedRef.current = true
      reload()
      return
    }
    videoProps.onError?.(e)
  }

  const playUrl =
    resolvedSrc && retryToken > 0
      ? `${resolvedSrc}${resolvedSrc.includes('?') ? '&' : '?'}_r=${retryToken}`
      : resolvedSrc

  return (
    <div className="flex w-full flex-col">
      <div className={`relative ${videoBoxClassName ?? ''}`} style={videoBoxStyle}>
        {srcLoading ? (
          <div className={`grid h-full w-full place-items-center bg-black text-zinc-500 ${videoClassName ?? ''}`} style={videoStyle}>
            <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
          </div>
        ) : (
          <video
            {...restVideoProps}
            key={`${videoKey ?? ''}#${retryToken}`}
            ref={videoRef}
            src={playUrl}
            className={videoClassName}
            style={videoStyle}
            onError={handleVideoError}
            onLoadedMetadata={(e) => {
              // A successful load proves the current URL works — restore the
              // full retry budget for any later mid-play failure.
              retriesRef.current = 0
              // Apply clip volume as soon as the element is ready — the volume
              // effect may have run while the <video> was still loading.
              const el = e.currentTarget
              el.volume = Math.max(0, Math.min(1, clipVolume))
              el.muted = clipVolume <= 0
            }}
          />
        )}
      </div>
      <PreviewSoundtrackWaveforms
        ref={soundtrackRef}
        musicUrl={musicUrl}
        musicRange={musicRange}
        musicVolume={musicVolume}
        musicTimeline={musicTimeline}
        voiceoverUrl={voiceoverUrl}
        voiceoverVolume={voiceoverVolume}
        voiceoverRange={voiceoverRange}
        voiceoverTimeline={voiceoverTimeline}
      />
    </div>
  )
}

export default VideoWithSoundtrack
