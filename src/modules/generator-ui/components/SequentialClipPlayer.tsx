import { useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle, Pause, Play, X } from 'lucide-react'
import { usePlayableVideoUrl, usePlayableVideoUrls } from '@/modules/generator-ui/lib/usePlayableVideoUrl'
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

// How early (seconds before the active clip ends) to mount the hidden
// next-clip prefetch <video>. Keeping this window short means the active clip
// owns the decoder/bandwidth for most of playback (no concurrent-decode
// stutter) while still eliminating the black gap at the clip boundary.
const PREFETCH_LEAD_SECONDS = 2.5

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
  musicTimeline?: [number, number]
  voiceoverUrl?: string | null
  voiceoverVolume?: number
  voiceoverRange?: [number, number]
  voiceoverTimeline?: [number, number]
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
  musicTimeline,
  voiceoverUrl,
  voiceoverVolume = 1,
  voiceoverRange,
  voiceoverTimeline,
  clipVolume = 1,
}: Props) {
  const [index, setIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const soundtrackRef = useRef<PreviewSoundtrackHandle | null>(null)
  const imageTimerRef = useRef<number | null>(null)
  // Per-clip duration (seconds) keyed by clip id, used to map a position on the
  // film-wide scrub bar to the right clip + local time. Preloaded for videos
  // and refreshed once each clip's metadata loads.
  const [clipDurations, setClipDurations] = useState<Record<string, number>>({})
  // True while the user is dragging the scrub bar (suppresses live updates).
  const scrubbingRef = useRef(false)
  // Local time (seconds) to seek the next active clip to once its video loads.
  const pendingLocalRef = useRef(0)
  // Tracks whether we've already attempted a one-time reload for the current
  // clip's source after a playback error, so a permanently-bad source skips
  // instead of looping forever.
  const erroredOnceRef = useRef<string | null>(null)

  // ── Playhead (decoupled from React render) ──────────────────────────────
  // The live film-wide playhead is written to DOM refs every frame WITHOUT
  // calling setState, so the heavy player subtree (active <video>, prefetch
  // <video>, wavesurfer waveforms) is NOT re-rendered 4–60×/sec. This is the
  // main fix for playback stutter.
  const globalTimeRef = useRef(0)
  const filmTotalRef = useRef(0)
  const fillRef = useRef<HTMLDivElement | null>(null)
  const knobRef = useRef<HTMLDivElement | null>(null)
  const timeLabelRef = useRef<HTMLSpanElement | null>(null)
  // Whether the hidden next-clip prefetch element should be mounted right now
  // (only true in the final PREFETCH_LEAD_SECONDS of the active clip).
  const [prefetchNext, setPrefetchNext] = useState(false)

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
  filmTotalRef.current = filmTotal

  // Write the playhead straight to the DOM (no re-render). Updates the scrub
  // fill width, the knob position, and the current-time label.
  const renderPlayhead = (t: number) => {
    globalTimeRef.current = t
    const total = filmTotalRef.current
    const pct = total > 0 ? Math.min(100, Math.max(0, (t / total) * 100)) : 0
    if (fillRef.current) fillRef.current.style.width = `${pct}%`
    if (knobRef.current) knobRef.current.style.left = `${pct}%`
    if (timeLabelRef.current) timeLabelRef.current.textContent = formatDuration(t)
  }

  // Re-paint the playhead whenever totals or the active clip change (e.g. once
  // metadata loads and filmTotal becomes accurate).
  useEffect(() => {
    renderPlayhead(globalTimeRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmTotal, index])

  // Maybe flip the prefetch flag on while the active clip nears its end.
  const maybeArmPrefetch = (localTime: number, localDuration: number) => {
    if (localDuration <= 0) return
    const near = localDuration - localTime <= PREFETCH_LEAD_SECONDS
    if (near) setPrefetchNext((p) => (p ? p : true))
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
    renderPlayhead(t)
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

  // Push the cumulative film time to the soundtrack so music/voiceover follow
  // the picture when the active clip changes or the active video seeks.
  const syncSoundtrackToFilmTime = (localTime: number) => {
    const s = soundtrackRef.current
    if (!s) return
    s.handleSeek(offsetBeforeIndex(index) + Math.max(0, localTime))
  }

  // Preload every video clip's duration so the scrub bar math is accurate even
  // before a clip has been played. This is the SINGLE metadata-probing path
  // (the total-duration display reads from `filmTotal`, derived from this map).
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

  // Warm the playable-URL cache for EVERY video clip up front so that when a
  // clip becomes active its (proxied / signed) URL is already resolved — this
  // removes the spinner gap at each clip boundary on the first play-through.
  const allVideoSrcs = useMemo(
    () => clips.map((c) => (c.kind === 'video' ? c.src : null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clips.map((c) => `${c.kind}:${c.id}:${c.src}`).join('|')],
  )
  const { urls: resolvedAllSrcs } = usePlayableVideoUrls(allVideoSrcs)

  // Look-ahead: resolved URL of the NEXT video clip, used to pre-buffer its
  // bytes in a hidden <video> so the swap at the clip boundary is instant.
  const nextIndex = clips.length > 0 ? (index + 1) % clips.length : 0
  const nextClip = clips[nextIndex] ?? null
  const nextResolvedSrc =
    nextClip && nextClip.kind === 'video' && nextIndex !== index
      ? resolvedAllSrcs[nextIndex] ?? null
      : null

  // Reset the per-clip error guard + prefetch arming whenever the active clip
  // changes.
  useEffect(() => {
    erroredOnceRef.current = null
    setPrefetchNext(false)
  }, [current?.id])

  useEffect(() => {
    if (current) onActiveClipChange?.(current.id)
  }, [current?.id, onActiveClipChange])

  // Drive image clips with a timer; videos drive themselves via onEnded.
  // The film-wide playhead is advanced with rAF (DOM-only, no setState) so the
  // scrub bar moves while an image clip is on screen.
  useEffect(() => {
    if (imageTimerRef.current) {
      window.clearTimeout(imageTimerRef.current)
      imageTimerRef.current = null
    }
    if (!current) return
    if (current.kind !== 'image') return

    const startLocal = Math.min(pendingLocalRef.current || 0, current.durationSec)
    pendingLocalRef.current = 0
    const base = offsetBeforeIndex(index)
    if (!scrubbingRef.current) renderPlayhead(base + startLocal)

    if (!isPlaying) return

    const remainingMs = Math.max(200, Math.round((current.durationSec - startLocal) * 1000))
    const startTs = performance.now()
    let raf = 0
    const tick = (now: number) => {
      if (scrubbingRef.current) { raf = requestAnimationFrame(tick); return }
      const elapsed = (now - startTs) / 1000
      const local = Math.min(current.durationSec, startLocal + elapsed)
      renderPlayhead(base + local)
      soundtrackRef.current?.syncTime(base + local)
      maybeArmPrefetch(local, current.durationSec)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    imageTimerRef.current = window.setTimeout(() => { goNext() }, remainingMs)
    return () => {
      cancelAnimationFrame(raf)
      if (imageTimerRef.current) {
        window.clearTimeout(imageTimerRef.current)
        imageTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.kind, isPlaying])

  // Load / seek the active video clip. Runs only when the active clip or its
  // resolved (proxied) source changes — NOT on play/pause toggles — so pausing
  // and resuming never rewrites currentTime (the playhead stays put).
  useEffect(() => {
    const v = videoRef.current
    if (!v || !current || current.kind !== 'video') return
    if (!resolvedVideoSrc) return
    const startLocal = pendingLocalRef.current || 0
    pendingLocalRef.current = 0
    try { v.currentTime = startLocal } catch { v.currentTime = 0 }
    if (isPlaying) {
      v.play().catch(() => {
        /* autoplay may be blocked — user can click play */
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.kind, resolvedVideoSrc])

  // Mirror the play/pause state onto the active video WITHOUT touching
  // currentTime, so clicking the icon stops exactly at the current frame.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !current || current.kind !== 'video') return
    if (!resolvedVideoSrc) return
    if (isPlaying) {
      v.play().catch(() => {
        /* autoplay may be blocked — user can click play */
      })
    } else {
      v.pause()
    }
  }, [isPlaying, current?.id, current?.kind, resolvedVideoSrc])

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
    const activeVideo = videoRef.current
    const local = activeVideo && current?.kind === 'video'
      ? activeVideo.currentTime || 0
      : pendingLocalRef.current || 0
    s.handleSeek(offsetBeforeIndex(index) + Math.max(0, local))
    if (isPlaying) s.play()
    else s.pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, musicUrl, voiceoverUrl, musicTimeline, voiceoverTimeline, current?.id, index, resolvedVideoSrc])

  function goNext() {
    if (clips.length === 0) return
    setIndex((i) => {
      const next = i + 1
      if (next >= clips.length) {
        // Loop back and pause at the start so user can replay.
        setIsPlaying(false)
        renderPlayhead(0)
        return 0
      }
      return next
    })
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
          width: 'fit-content',
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
                preload="auto"
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
                    setClipDurations((prev) =>
                      prev[current.id] === el.duration ? prev : { ...prev, [current.id]: el.duration },
                    )
                  }
                  const filmTime = offsetBeforeIndex(index) + (el.currentTime || 0)
                  soundtrackRef.current?.handleSeek(filmTime)
                  if (!el.paused && !el.ended) soundtrackRef.current?.play()
                }}
                onTimeUpdate={(e) => {
                  if (scrubbingRef.current) return
                  const el = e.currentTarget
                  const ft = offsetBeforeIndex(index) + el.currentTime
                  // DOM-only playhead update (no re-render).
                  renderPlayhead(ft)
                  // Continuously re-gate the soundtrack so music/voiceover start
                  // and stop at the exact film second the user selected.
                  soundtrackRef.current?.syncTime(ft)
                  // Arm the next-clip prefetch only as we approach the boundary.
                  maybeArmPrefetch(el.currentTime, el.duration || durationOf(current))
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
                onPlay={(e) => {
                  const filmTime = offsetBeforeIndex(index) + (e.currentTarget.currentTime || 0)
                  soundtrackRef.current?.handleSeek(filmTime)
                  soundtrackRef.current?.play()
                  setIsPlaying(true)
                }}
                onPause={() => {
                  soundtrackRef.current?.pause()
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

          {/* Hidden double-buffer: pre-download the next clip's bytes so the
              swap at the clip boundary is instant (no black/loading gap). It is
              only mounted in the final PREFETCH_LEAD_SECONDS of the active clip
              so a second decode pipeline never competes with the playing clip
              for the whole duration (the previous cause of playback stutter). */}
          {prefetchNext && nextResolvedSrc ? (
            <video
              key={`prefetch:${nextResolvedSrc}`}
              src={nextResolvedSrc}
              preload="auto"
              muted
              playsInline
              aria-hidden="true"
              tabIndex={-1}
              className="pointer-events-none absolute h-px w-px opacity-0"
              style={{ left: -9999, top: -9999 }}
            />
          ) : null}

          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 py-2">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 bg-black/70 text-zinc-100 transition hover:border-white/30 hover:bg-white/10"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>

            <span
              ref={timeLabelRef}
              className="shrink-0 text-[11px] font-semibold tabular-nums text-zinc-200"
            >
              {formatDuration(globalTimeRef.current)}
            </span>

            <div
              role="slider"
              aria-label="Seek film"
              aria-valuemin={0}
              aria-valuemax={Math.round(filmTotal)}
              aria-valuenow={Math.round(globalTimeRef.current)}
              tabIndex={0}
              onPointerDown={(e) => {
                if (filmTotal <= 0) return
                e.currentTarget.setPointerCapture(e.pointerId)
                scrubbingRef.current = true
                const rect = e.currentTarget.getBoundingClientRect()
                const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                seekToFilmTime(frac * filmTotal)
              }}
              onPointerMove={(e) => {
                if (!scrubbingRef.current || filmTotal <= 0) return
                const rect = e.currentTarget.getBoundingClientRect()
                const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                renderPlayhead(frac * filmTotal)
              }}
              onPointerUp={(e) => {
                if (filmTotal <= 0) return
                const rect = e.currentTarget.getBoundingClientRect()
                const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                scrubbingRef.current = false
                seekToFilmTime(frac * filmTotal)
                try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
              }}
              onKeyDown={(e) => {
                if (filmTotal <= 0) return
                if (e.key === 'ArrowRight') { e.preventDefault(); seekToFilmTime(Math.min(filmTotal, globalTimeRef.current + 1)) }
                else if (e.key === 'ArrowLeft') { e.preventDefault(); seekToFilmTime(Math.max(0, globalTimeRef.current - 1)) }
              }}
              className="group relative flex h-6 flex-1 cursor-pointer items-center"
            >
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                <div
                  ref={fillRef}
                  className="absolute inset-y-0 left-0 rounded-full bg-emerald-400"
                  style={{ width: '0%' }}
                />
              </div>
              <div
                ref={knobRef}
                className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
                style={{ left: '0%' }}
              />
            </div>

            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-zinc-200">
              {formatDuration(filmTotal)}
            </span>
          </div>
        </div>

        {/* Synced soundtrack waveforms (live preview only — not part of Final Film). */}
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
    </div>
  )
}
