import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react'

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
}

export function SequentialClipPlayer({
  clips,
  ratioToCss,
  ratioToHeight,
  ratioToWidth,
  maxHeightPx,
  onClose,
  onActiveClipChange,
}: Props) {
  const [index, setIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const imageTimerRef = useRef<number | null>(null)

  // Keep index inside bounds when clips change.
  useEffect(() => {
    if (clips.length === 0) {
      setIndex(0)
      return
    }
    if (index >= clips.length) setIndex(0)
  }, [clips.length, index])

  const current = clips[index] ?? null

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

  // Try to autoplay videos when the active clip is a video.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !current || current.kind !== 'video') return
    v.currentTime = 0
    if (isPlaying) {
      v.play().catch(() => {
        /* autoplay may be blocked — user can click play */
      })
    } else {
      v.pause()
    }
  }, [current?.id, current?.kind, isPlaying])

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
            <video
              ref={videoRef}
              key={`${current.id}:${current.src}`}
              src={current.src}
              className="h-full w-full bg-black object-contain"
              playsInline
              autoPlay={isPlaying}
              controls={false}
              onEnded={goNext}
              onPlay={() => setIsPlaying(true)}
              onPause={() => {
                // Only mirror pauses that came from the user (not from src swap).
                if (videoRef.current && !videoRef.current.ended) {
                  // no-op: state is driven by isPlaying button
                }
              }}
            />
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
              <span className="rounded-full border border-white/15 bg-black/60 px-2 py-0.5 tabular-nums">
                {index + 1} / {clips.length}
              </span>
              <span className="hidden rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-emerald-200 sm:inline">
                Live preview
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-white/10 px-4 py-3">
          <p className="max-h-12 min-w-0 flex-1 overflow-hidden whitespace-normal break-words text-sm font-medium leading-6 text-zinc-200">
            {current.label ?? (current.kind === 'video' ? 'Clip' : 'Image')}
          </p>
          <p className="text-[11px] leading-5 text-zinc-500">
            All cards are auto-stitched in this preview. Voice & music are heard only in Final Film.
          </p>
        </div>
      </div>
    </div>
  )
}
