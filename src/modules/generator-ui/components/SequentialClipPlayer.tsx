import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, LoaderCircle, Pause, Play, X } from 'lucide-react'
import { usePlayableVideoUrl } from '@/modules/generator-ui/lib/usePlayableVideoUrl'
import {
  PreviewSoundtrackWaveforms,
  type PreviewSoundtrackHandle,
} from '@/modules/generator-ui/components/PreviewSoundtrackWaveforms'

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '--:--'
  const total = Math.round(sec)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function useTotalDuration(clips: SeqClip[]): number {
  const cacheRef = useRef<Map<string, number>>(new Map())
  const [, force] = useState(0)

  useEffect(() => {
    let cancelled = false
    const cache = cacheRef.current
    const videos = clips.filter((c): c is SeqVideoClip => c.kind === 'video')
    const missing = videos.filter((v) => !cache.has(v.src))
    if (missing.length === 0) return
    let pending = missing.length
    missing.forEach((v) => {
      const el = document.createElement('video')
      el.preload = 'metadata'
      el.muted = true
      el.src = v.src
      const done = (dur: number) => {
        if (cancelled) return
        cache.set(v.src, Number.isFinite(dur) && dur > 0 ? dur : 0)
        pending -= 1
        if (pending <= 0) force((n) => n + 1)
      }
      el.addEventListener('loadedmetadata', () => done(el.duration), { once: true })
      el.addEventListener('error', () => done(0), { once: true })
    })
    return () => { cancelled = true }
  }, [clips.map((c) => `${c.kind}:${c.id}:${c.src}`).join('|')])

  return useMemo(() => {
    let total = 0
    for (const c of clips) {
      if (c.kind === 'image') total += Math.max(0, c.durationSec || 0)
      else total += cacheRef.current.get(c.src) ?? 0
    }
    return total
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, cacheRef.current.size])
}

// Lightweight type aliases (kept compatible with DashboardPage's UnifiedClip).
type SeqVideoClip = {
  kind: 'video'
  id: string
  src: string
  ratio: '9:16' | '1:1' | '16:9'
  label?: string
}
type SeqImageClip = {
  kind: 'image'
  id: string
  src: string
  ratio: '9:16' | '1:1' | '16:9'
  durationSec: number
  label?: string
}
export type SeqClip = SeqVideoClip | SeqImageClip

type Props = {
  clips: SeqClip[]
  ratioToCss: (r: '9:16' | '1:1' | '16:9') => string
  ratioToHeight: (r: '9:16' | '1:1' | '16:9') => string
  ratioToWidth: (r: '9:16' | '1:1' | '16:9') => string
  maxHeightPx: number
  onClose?: () => void
  /** Called when a clip becomes active so the parent can highlight a card. */
  onActiveClipChange?: (clipId: string) => void
  /** Live preview audio overlays (do NOT affect Final Film generation). */
  musicUrl?: string | null
  musicRange?: [number, number]
  musicVolume?: number
  voiceoverUrl?: string | null
  voiceoverVolume?: number
  /** Volume of the clip's own audio track in preview (0..1). */
  clipVolume?: number
}

export function SequentialClipPlayer({
  clips,
  ratioToCss,
  ratioToHeight,
  ratioToWidth,
  maxHeightPx,
  onClose,
  onActiveClipChange,
  musicUrl,
  musicRange,
  musicVolume = 1,
  voiceoverUrl,
  voiceoverVolume = 1,
  clipVolume = 1,
}: Props) {
  const [index, setIndex] = useState(0)
  const totalDuration = useTotalDuration(clips)
  const [isPlaying, setIsPlaying] = useState(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const soundtrackRef = useRef<PreviewSoundtrackHandle | null>(null)
  const imageTimerRef = useRef<number | null>(null)
  // Per-clip duration (seconds) keyed by clip id, used to map a position on the
  // film-wide scrub bar to the right clip + local time. Preloaded for videos
  // and refreshed once each clip's metadata loads.
  const [clipDurations, setClipDurations] = useState<Record<string, number>>({})
  // The live film-wide playhead (seconds across all clips).
  const [globalTime, setGlobalTime] = useState(0)
  // True while the user is dragging the scrub bar (suppresses live updates).
  const scrubbingRef = useRef(false)
  // Local time (seconds) to seek the next active clip to once its video loads.
  const pendingLocalRef = useRef(0)
  // Tracks whether we've already attempted a one-time reload for the current
  // clip's source after a playback error, so a permanently-bad source skips
  // instead of looping forever.
  const erroredOnceRef = useRef<string | null>(null)

  const durationOf = (clip: SeqClip): number => {
    if (clip.kind === 'image') return Math.max(0, clip.durationSec || 0)
    return clipDurations[clip.id] ?? 0
  }

  // Cumulative film time before the given clip index (sum of prior durations).
  const offsetBeforeIndex = (i: number): number => {
    let total = 0
    for (let k = 0; k < i && k < clips.length; k++) total += durationOf(clips[k])
    return total
  }

  const filmTotal = useMemo(() => {
    let total = 0
    for (const c of clips) total += durationOf(c)
    return total
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, clipDurations])

  // Preload every video clip's duration so the scrub bar math is accurate even
  // before a clip has been played.
  useEffect(() => {
    let cancelled = false
    const videos = clips.filter((c): c is SeqVideoClip => c.kind === 'video')
    const missing = videos.filter((v) => !(v.id in clipDurations))
    if (missing.length === 0) return
    missing.forEach((v) => {
      const el = document.createElement('video')
      el.preload = 'metadata'
      el.muted = true
      el.src = v.src
      const done = (dur: number) => {
        if (cancelled) return
        if (Number.isFinite(dur) && dur > 0) {
          setClipDurations((prev) => (prev[v.id] === dur ? prev : { ...prev, [v.id]: dur }))
        }
      }
      el.addEventListener('loadedmetadata', () => done(el.duration), { once: true })
      el.addEventListener('error', () => done(0), { once: true })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips.map((c) => `${c.kind}:${c.id}`).join('|')])

  // Push the cumulative film time to the soundtrack so music/voiceover follow
  // the picture when the active clip changes or the active video seeks.
  const syncSoundtrackToFilmTime = (localTime: number) => {
    const s = soundtrackRef.current
    if (!s) return
    s.handleSeek(offsetBeforeIndex(index) + Math.max(0, localTime))
  }

  // Seek the whole film to an absolute time (seconds): pick the clip that owns
  // that moment, activate it, and seek the video (or position an image) there.
  const seekToFilmTime = (target: number) => {
    if (clips.length === 0) return
    const t = Math.max(0, Math.min(target, filmTotal || target))
    let acc = 0
    let targetIndex = clips.length - 1
    for (let k = 0; k < clips.length; k++) {
      const d = durationOf(clips[k]) || 0
      if (t < acc + d || k === clips.length - 1) {
        targetIndex = k
        break
      }
      acc += d
    }
    const local = Math.max(0, t - acc)
    setGlobalTime(t)
    soundtrackRef.current?.handleSeek(t)
    if (targetIndex === index) {
      const v = videoRef.current
      if (v && clips[targetIndex]?.kind === 'video') {
        try { v.currentTime = local } catch { /* ignore */ }
      } else {
        pendingLocalRef.current = local
      }
    } else {
      pendingLocalRef.current = local
      setIndex(targetIndex)
    }
  }


  // Keep index inside bounds when clips change.
  useEffect(() => {
    if (clips.length === 0) {
      setIndex(0)
      return
    }
    if (index >= clips.length) setIndex(0)
  }, [clips.length, index])

  const current = clips[index] ?? null

  const { url: resolvedVideoSrc, loading: srcLoading, reload } = usePlayableVideoUrl(
    current && current.kind === 'video' ? current.src : null,
  )

  // Reset the per-clip error guard whenever the active clip changes.
  useEffect(() => {
    erroredOnceRef.current = null
  }, [current?.id])

  useEffect(() => {
    if (current) onActiveClipChange?.(current.id)
  }, [current?.id, onActiveClipChange])

  // Drive image clips with a timer; videos drive themselves via onEnded.
  useEffect(() => {
    if (imageTimerRef.current) {
      window.clearTimeout(imageTimerRef.current)
      imageTimerRef.current = null
    }
    if (!current) return
    if (current.kind !== 'image') return
    if (!isPlaying) return
    const ms = Math.max(500, Math.round(current.durationSec * 1000))
    imageTimerRef.current = window.setTimeout(() => {
      goNext()
    }, ms)
    return () => {
      if (imageTimerRef.current) {
        window.clearTimeout(imageTimerRef.current)
        imageTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.kind, isPlaying])

  // Try to autoplay videos when the active clip is a video. Re-runs when the
  // resolved (proxied) source becomes available so playback starts as soon as
  // the URL is ready, not only when the clip index changes.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !current || current.kind !== 'video') return
    if (!resolvedVideoSrc) return
    v.currentTime = 0
    if (isPlaying) {
      v.play().catch(() => {
        /* autoplay may be blocked — user can click play */
      })
    } else {
      v.pause()
    }
  }, [current?.id, current?.kind, isPlaying, resolvedVideoSrc])

  // Apply clip volume to the active video element.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume = Math.max(0, Math.min(1, clipVolume))
    v.muted = clipVolume <= 0
  }, [current?.id, clipVolume])

  // Drive the soundtrack waveforms (music + voiceover) from the player's
  // play state so the audio stays locked to the picture. The waveform
  // component owns volume/range/looping internally.
  useEffect(() => {
    const s = soundtrackRef.current
    if (!s) return
    // Re-align the soundtrack to where this clip starts in the overall film,
    // then start/stop it to match the player's play state.
    s.handleSeek(offsetBeforeIndex(index))
    if (isPlaying) s.play()
    else s.pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, musicUrl, voiceoverUrl, current?.id, index])


  function goNext() {
    if (clips.length === 0) return
    setIndex((i) => {
      const next = i + 1
      if (next >= clips.length) {
        // Loop back and pause at the start so user can replay.
        setIsPlaying(false)
        return 0
      }
      return next
    })
  }

  function goPrev() {
    if (clips.length === 0) return
    setIndex((i) => Math.max(0, i - 1))
  }

  function togglePlay() {
    setIsPlaying((p) => !p)
  }

  // Choose the chrome ratio from the first clip so the frame stays stable.
  const frameRatio = clips[0]?.ratio ?? current?.ratio ?? '16:9'

  // Reserve vertical space only for the soundtrack waveforms (no prompt
  // caption) so the video shrinks just enough to keep them fully visible.
  const hasSoundtrack = Boolean(musicUrl) || Boolean(voiceoverUrl)
  const reservedFooterPx = hasSoundtrack
    ? 24 + (musicUrl ? 52 : 0) + (voiceoverUrl ? 52 : 0)
    : 0
  const videoMaxHeightPx = Math.max(160, maxHeightPx - reservedFooterPx)

  if (!current) return null

  return (
    <div className="flex w-full justify-center">
      <div
        className="overflow-hidden rounded-[22px] border border-white/10 bg-[#07080a]/90 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur"
        style={{
          width: ratioToWidth(frameRatio),
          maxWidth: 'calc(100vw - 56rem)',
          maxHeight: `${maxHeightPx}px`,
        }}
      >
        <div
          className="relative overflow-hidden bg-black"
          style={{
            aspectRatio: ratioToCss(frameRatio),
            height: ratioToHeight(frameRatio),
            maxHeight: `${videoMaxHeightPx}px`,
            maxWidth: 'calc(100vw - 56rem)',
          }}
        >
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

          {current.kind === 'video' ? (
            srcLoading || !resolvedVideoSrc ? (
              <div className="grid h-full w-full place-items-center bg-black text-zinc-500">
                <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
              </div>
            ) : (
              <video
                ref={videoRef}
                key={`${current.id}:${resolvedVideoSrc}`}
                src={resolvedVideoSrc}
                className="h-full w-full bg-black object-contain"
                playsInline
                autoPlay={isPlaying}
                controls={false}
                onLoadedMetadata={(e) => {
                  // Apply clip volume as soon as the element is ready — the
                  // volume effect may have run while the <video> was still
                  // loading (ref null), so re-apply here.
                  const el = e.currentTarget
                  el.volume = Math.max(0, Math.min(1, clipVolume))
                  el.muted = clipVolume <= 0
                  // Record this clip's true duration so cumulative film time
                  // (and the soundtrack sync) stays accurate.
                  if (current && Number.isFinite(el.duration) && el.duration > 0) {
                    clipDurationsRef.current.set(current.id, el.duration)
                  }
                }}
                onSeeking={(e) => syncSoundtrackToFilmTime(e.currentTarget.currentTime)}
                onSeeked={(e) => syncSoundtrackToFilmTime(e.currentTarget.currentTime)}
                onEnded={goNext}
                onError={() => {
                  // A clip's source failed to load/play (e.g. expired proxy
                  // token). Retry resolution once; if it fails again, skip to
                  // the next clip so the sequence never stalls.
                  if (current && erroredOnceRef.current !== current.id) {
                    erroredOnceRef.current = current.id
                    reload()
                  } else {
                    goNext()
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => {
                  // Only mirror pauses that came from the user (not from src swap).
                  if (videoRef.current && !videoRef.current.ended) {
                    // no-op: state is driven by isPlaying button
                  }
                }}
              />
            )
          ) : (
            <img
              key={current.id}
              src={current.src}
              alt={current.label ?? 'Clip'}
              className="h-full w-full bg-black object-contain"
            />
          )}

          {/* Bottom overlay controls */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 py-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                disabled={index === 0}
                aria-label="Previous clip"
                className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/60 text-zinc-200 transition hover:border-white/30 hover:bg-white/10 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/70 text-zinc-100 transition hover:border-white/30 hover:bg-white/10"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={index >= clips.length - 1}
                aria-label="Next clip"
                className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/60 text-zinc-200 transition hover:border-white/30 hover:bg-white/10 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
              <span
                title="Total film duration"
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 tabular-nums"
              >
                <Clock className="h-3 w-3" aria-hidden="true" />
                {formatDuration(totalDuration)}
              </span>
              <span className="rounded-full border border-white/15 bg-black/60 px-2 py-0.5 tabular-nums">
                {index + 1} / {clips.length}
              </span>
              <span className="inline rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-emerald-200">
                Live preview
              </span>
            </div>
          </div>
        </div>



        {/* Synced soundtrack waveforms (live preview only — not part of Final Film). */}
        <PreviewSoundtrackWaveforms
          ref={soundtrackRef}
          musicUrl={musicUrl}
          musicRange={musicRange}
          musicVolume={musicVolume}
          voiceoverUrl={voiceoverUrl}
          voiceoverVolume={voiceoverVolume}
        />
      </div>
    </div>
  )
}
