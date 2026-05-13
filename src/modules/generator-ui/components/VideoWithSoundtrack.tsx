import { useEffect, useRef, type VideoHTMLAttributes } from 'react'

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
 * voiceover track with the video's playback state. Used by the single-clip
 * preview so the user hears the same mix as the Final Film preview without
 * any extra controls.
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
  const musicRef = useRef<HTMLAudioElement | null>(null)
  const voiceRef = useRef<HTMLAudioElement | null>(null)

  // Apply clip volume / mute to the video element.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume = Math.max(0, Math.min(1, clipVolume))
    v.muted = clipVolume <= 0
  }, [clipVolume])

  // Live volume updates for music / voiceover.
  useEffect(() => {
    const a = musicRef.current
    if (a) a.volume = Math.max(0, Math.min(1, musicVolume))
  }, [musicVolume])
  useEffect(() => {
    const a = voiceRef.current
    if (a) a.volume = Math.max(0, Math.min(1, voiceoverVolume))
  }, [voiceoverVolume])

  // Sync audios with the video's play / pause / seek / end events.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const start = musicRange?.[0] ?? 0
    const end = musicRange?.[1] ?? 0
    const hasMusicWindow = end > start

    const playMusic = () => {
      const a = musicRef.current
      if (!a || !musicUrl) return
      if (hasMusicWindow && (a.currentTime < start || a.currentTime >= end)) {
        a.currentTime = start
      }
      a.play().catch(() => { /* autoplay block — ignore */ })
    }
    const playVoice = () => {
      const a = voiceRef.current
      if (!a || !voiceoverUrl) return
      a.play().catch(() => { /* ignore */ })
    }
    const pauseAll = () => {
      musicRef.current?.pause()
      voiceRef.current?.pause()
    }

    const onPlay = () => { playMusic(); playVoice() }
    const onPause = () => { pauseAll() }
    const onEnded = () => { pauseAll() }
    const onSeeked = () => {
      // Restart voiceover if user scrubbed back to the beginning.
      if (voiceRef.current && v.currentTime <= 0.05) {
        voiceRef.current.currentTime = 0
      }
      // Re-clamp music to its window.
      const a = musicRef.current
      if (a && hasMusicWindow && (a.currentTime < start || a.currentTime >= end)) {
        a.currentTime = start
      }
    }

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onEnded)
    v.addEventListener('seeked', onSeeked)

    // If video is already playing when this effect re-runs (e.g. URL changes
    // for music/voice while playing), restart the audios in sync.
    if (!v.paused && !v.ended) {
      playMusic()
      playVoice()
    }

    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onEnded)
      v.removeEventListener('seeked', onSeeked)
    }
  }, [musicUrl, voiceoverUrl, musicRange?.[0], musicRange?.[1]])

  // Loop music inside its window.
  useEffect(() => {
    const a = musicRef.current
    if (!a || !musicUrl) return
    const start = musicRange?.[0] ?? 0
    const end = musicRange?.[1] ?? 0
    if (!(end > start)) return
    const onTime = () => {
      if (a.currentTime >= end) a.currentTime = start
    }
    a.addEventListener('timeupdate', onTime)
    return () => { a.removeEventListener('timeupdate', onTime) }
  }, [musicUrl, musicRange?.[0], musicRange?.[1]])

  // Pause audios when their URL is removed or component unmounts.
  useEffect(() => {
    return () => {
      try { musicRef.current?.pause() } catch { /* ignore */ }
      try { voiceRef.current?.pause() } catch { /* ignore */ }
    }
  }, [])

  return (
    <>
      <video
        {...videoProps}
        key={videoKey}
        ref={videoRef}
        src={src}
      />
      {musicUrl ? (
        <audio
          ref={musicRef}
          src={musicUrl}
          preload="auto"
          loop={!musicRange || musicRange[1] <= musicRange[0]}
        />
      ) : null}
      {voiceoverUrl ? (
        <audio ref={voiceRef} src={voiceoverUrl} preload="auto" />
      ) : null}
    </>
  )
}

export default VideoWithSoundtrack
