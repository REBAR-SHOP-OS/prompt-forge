import { useEffect, useRef, type VideoHTMLAttributes } from 'react'
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
  voiceoverUrl?: string | null
  voiceoverVolume?: number
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
  voiceoverUrl,
  voiceoverVolume = 1,
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
    const onSeeked = () => soundtrackRef.current?.handleSeek(v.currentTime)

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onEnded)
    v.addEventListener('seeked', onSeeked)

    // If video is already playing when this effect re-runs (e.g. soundtrack URL
    // changed while playing), restart the audios in sync.
    if (!v.paused && !v.ended) soundtrackRef.current?.play()

    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onEnded)
      v.removeEventListener('seeked', onSeeked)
    }
  }, [musicUrl, voiceoverUrl])

  const { className: videoClassName, style: videoStyle, ...restVideoProps } = videoProps

  const { url: resolvedSrc, loading: srcLoading } = usePlayableVideoUrl(src)

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
        {srcLoading ? (
          <div className={`grid h-full w-full place-items-center bg-black text-zinc-500 ${videoClassName ?? ''}`} style={videoStyle}>
            <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
          </div>
        ) : (
          <video
            {...restVideoProps}
            key={videoKey}
            ref={videoRef}
            src={resolvedSrc}
            className={videoClassName}
            style={videoStyle}
            onLoadedMetadata={(e) => {
              // Apply clip volume as soon as the element is ready — the volume
              // effect may have run while the <video> was still loading.
              const el = e.currentTarget
              el.volume = Math.max(0, Math.min(1, clipVolume))
              el.muted = clipVolume <= 0
            }}
          />
        )}
        <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200 backdrop-blur">
          Live preview
        </span>
      </div>
      <PreviewSoundtrackWaveforms
        ref={soundtrackRef}
        musicUrl={musicUrl}
        musicRange={musicRange}
        musicVolume={musicVolume}
        voiceoverUrl={voiceoverUrl}
        voiceoverVolume={voiceoverVolume}
      />
    </div>
  )
}

export default VideoWithSoundtrack
