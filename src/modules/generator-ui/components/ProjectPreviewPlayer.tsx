import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, X } from 'lucide-react'

export type PreviewClip =
  | { kind: 'video'; id: string; src: string; duration?: number | null }
  | { kind: 'image'; id: string; src: string; durationSeconds: number }

export interface ProjectPreviewPlayerProps {
  clips: PreviewClip[]
  /** Background music (already resolvable by the browser). */
  musicUrl?: string | null
  /** [start, end] in seconds within the music file. */
  musicRange?: [number, number]
  musicVolume?: number
  /** When music is present: 'music-only' mutes clip audio, 'mix' keeps it. */
  soundtrackMode?: 'music-only' | 'mix'
  /** Clip audio gain when in mix mode. */
  clipVolume?: number
  /** AI voiceover overlay. */
  voiceoverUrl?: string | null
  voiceoverVolume?: number
  /** Clip audio gain when voiceover is active without music. */
  voiceoverClipVolume?: number
  onClose?: () => void
}

/**
 * Client-side playlist preview that mirrors what the Final Film server merge
 * will produce: clips play back-to-back, with synchronized music/voiceover
 * overlay and the same volume mixing rules used by mergeVideos.ts.
 */
export function ProjectPreviewPlayer({
  clips,
  musicUrl = null,
  musicRange,
  musicVolume = 1,
  soundtrackMode = 'music-only',
  clipVolume = 1,
  voiceoverUrl = null,
  voiceoverVolume = 1,
  voiceoverClipVolume = 0.3,
  onClose,
}: ProjectPreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const musicRef = useRef<HTMLAudioElement | null>(null)
  const voiceRef = useRef<HTMLAudioElement | null>(null)
  const imageTimerRef = useRef<number | null>(null)

  const hasMusic = Boolean(musicUrl) && Boolean(musicRange) && (musicRange?.[1] ?? 0) > (musicRange?.[0] ?? 0)
  const hasVoiceover = Boolean(voiceoverUrl)

  // Effective clip volume mirrors handleMergeAllVideos in DashboardPage.
  const effectiveClipVolume = useMemo(() => {
    if (hasMusic) return soundtrackMode === 'music-only' ? 0 : clipVolume
    if (hasVoiceover) return voiceoverClipVolume
    return 1
  }, [hasMusic, hasVoiceover, soundtrackMode, clipVolume, voiceoverClipVolume])

  const [index, setIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  // Cumulative seconds across clips before the current one (used to seek music/voice).
  const elapsedBeforeRef = useRef(0)

  // Whenever the clip list shrinks past current index, snap back.
  useEffect(() => {
    if (index >= clips.length) {
      setIndex(0)
      elapsedBeforeRef.current = 0
      setIsPlaying(false)
    }
  }, [clips.length, index])

  // Reset playlist position when the clip identity changes.
  const clipsKey = clips.map((c) => c.id).join('|')
  useEffect(() => {
    setIndex(0)
    elapsedBeforeRef.current = 0
    setIsPlaying(false)
  }, [clipsKey])

  // ---- Video volume sync (live: reacts to music/voiceover changes) ----
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume = Math.max(0, Math.min(1, effectiveClipVolume))
    v.muted = effectiveClipVolume <= 0.001
  }, [effectiveClipVolume, index])

  // ---- Music element sync ----
  useEffect(() => {
    const m = musicRef.current
    if (!m) return
    m.volume = Math.max(0, Math.min(1, musicVolume))
  }, [musicVolume])

  // ---- Voiceover element sync ----
  useEffect(() => {
    const a = voiceRef.current
    if (!a) return
    a.volume = Math.max(0, Math.min(1, voiceoverVolume))
  }, [voiceoverVolume])

  const stopImageTimer = useCallback(() => {
    if (imageTimerRef.current != null) {
      window.clearTimeout(imageTimerRef.current)
      imageTimerRef.current = null
    }
  }, [])

  const goToNext = useCallback(() => {
    stopImageTimer()
    setIndex((prev) => {
      const finished = clips[prev]
      const finishedDur =
        finished?.kind === 'image'
          ? finished.durationSeconds
          : Math.max(0, videoRef.current?.duration ?? finished?.duration ?? 0)
      elapsedBeforeRef.current += finishedDur
      const next = prev + 1
      if (next >= clips.length) {
        // End of playlist — stop everything and reset.
        setIsPlaying(false)
        elapsedBeforeRef.current = 0
        try { musicRef.current?.pause() } catch { /* ignore */ }
        try { voiceRef.current?.pause() } catch { /* ignore */ }
        return 0
      }
      return next
    })
  }, [clips, stopImageTimer])

  // ---- Image clip timer ----
  useEffect(() => {
    stopImageTimer()
    const current = clips[index]
    if (!current || current.kind !== 'image' || !isPlaying) return
    const ms = Math.max(500, current.durationSeconds * 1000)
    imageTimerRef.current = window.setTimeout(() => {
      goToNext()
    }, ms)
    return () => stopImageTimer()
  }, [clips, index, isPlaying, goToNext, stopImageTimer])

  // ---- Play/Pause control of all media together ----
  const syncOverlayPlayback = useCallback(
    (elapsedExtra = 0) => {
      const totalElapsed = elapsedBeforeRef.current + elapsedExtra
      // Music seeking
      if (hasMusic && musicRef.current && musicRange) {
        const target = musicRange[0] + totalElapsed
        const within = target < musicRange[1]
        if (within) {
          if (Math.abs(musicRef.current.currentTime - target) > 0.35) {
            try { musicRef.current.currentTime = target } catch { /* ignore */ }
          }
          if (isPlaying) {
            void musicRef.current.play().catch(() => undefined)
          }
        } else {
          try { musicRef.current.pause() } catch { /* ignore */ }
        }
      }
      // Voiceover seeking (always plays from 0 along with the timeline)
      if (hasVoiceover && voiceRef.current) {
        const target = totalElapsed
        if (target < (voiceRef.current.duration || Infinity)) {
          if (Math.abs(voiceRef.current.currentTime - target) > 0.35) {
            try { voiceRef.current.currentTime = target } catch { /* ignore */ }
          }
          if (isPlaying) {
            void voiceRef.current.play().catch(() => undefined)
          }
        } else {
          try { voiceRef.current.pause() } catch { /* ignore */ }
        }
      }
    },
    [hasMusic, hasVoiceover, isPlaying, musicRange],
  )

  // When the active clip changes (or play toggles), realign overlays.
  useEffect(() => {
    if (!isPlaying) {
      try { musicRef.current?.pause() } catch { /* ignore */ }
      try { voiceRef.current?.pause() } catch { /* ignore */ }
      try { videoRef.current?.pause() } catch { /* ignore */ }
      return
    }
    syncOverlayPlayback(0)
    const v = videoRef.current
    const current = clips[index]
    if (current?.kind === 'video' && v) {
      try { v.currentTime = 0 } catch { /* ignore */ }
      void v.play().catch(() => undefined)
    }
  }, [isPlaying, index, clips, syncOverlayPlayback])

  // Re-align overlays mid-clip occasionally to avoid drift.
  const handleVideoTimeUpdate = useCallback(() => {
    if (!isPlaying) return
    const v = videoRef.current
    if (!v) return
    syncOverlayPlayback(v.currentTime)
  }, [isPlaying, syncOverlayPlayback])

  const togglePlay = () => {
    setIsPlaying((p) => !p)
  }

  // Hard stop overlays on unmount.
  useEffect(() => {
    return () => {
      stopImageTimer()
      try { musicRef.current?.pause() } catch { /* ignore */ }
      try { voiceRef.current?.pause() } catch { /* ignore */ }
    }
  }, [stopImageTimer])

  const current = clips[index]

  return (
    <div className="relative h-full w-full">
      {/* Close */}
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          title="Close preview"
          className="absolute right-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/60 text-zinc-200 backdrop-blur transition hover:border-rose-300/40 hover:bg-rose-500/20 hover:text-rose-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}

      {/* Stage */}
      <div className="relative h-full w-full bg-black">
        {current?.kind === 'video' ? (
          <video
            key={current.id}
            ref={videoRef}
            src={current.src}
            className="h-full w-full bg-black object-contain"
            playsInline
            preload="metadata"
            onLoadedMetadata={() => {
              const v = videoRef.current
              if (!v) return
              v.volume = Math.max(0, Math.min(1, effectiveClipVolume))
              v.muted = effectiveClipVolume <= 0.001
            }}
            onEnded={goToNext}
            onTimeUpdate={handleVideoTimeUpdate}
          />
        ) : current?.kind === 'image' ? (
          <img
            key={current.id}
            src={current.src}
            alt=""
            className="h-full w-full bg-black object-contain"
          />
        ) : null}

        {/* Hidden overlay audio */}
        {hasMusic && musicUrl ? (
          <audio
            ref={musicRef}
            src={musicUrl}
            preload="auto"
            crossOrigin="anonymous"
            className="hidden"
          />
        ) : null}
        {hasVoiceover && voiceoverUrl ? (
          <audio
            ref={voiceRef}
            src={voiceoverUrl}
            preload="auto"
            crossOrigin="anonymous"
            className="hidden"
          />
        ) : null}

        {/* Center play/pause overlay */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
          className="absolute inset-0 z-10 grid place-items-center bg-black/0 transition hover:bg-black/10"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur transition hover:scale-105">
            {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="ml-1 h-7 w-7" />}
          </span>
        </button>

        {/* Playlist position indicator */}
        <div className="pointer-events-none absolute bottom-2 left-2 z-10 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-200 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Project preview · {index + 1}/{clips.length}
        </div>
      </div>
    </div>
  )
}
