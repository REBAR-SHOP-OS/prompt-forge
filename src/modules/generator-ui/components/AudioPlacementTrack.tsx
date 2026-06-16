import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Music, Mic } from 'lucide-react'

export type AudioPlacement = {
  /** Seconds into the film where the track begins. */
  startInVideo: number
  /** Seconds trimmed from the head of the source. */
  trimStart: number
  /** Seconds at which the source is cut off (0 = full source duration). */
  trimEnd: number
  /** Source duration in seconds (read from the decoded audio). */
  duration: number
}

type Props = {
  url: string
  kind: 'music' | 'voiceover'
  /** Total film duration in seconds (the timeline this track is placed on). */
  filmDuration: number
  placement: AudioPlacement
  onChange: (next: AudioPlacement) => void
}

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

type DragMode = 'move' | 'trim-start' | 'trim-end' | null

/**
 * Draggable / trimmable audio region placed along the video timeline.
 *
 * The full bar represents the whole film duration. The highlighted region is
 * the audio: its left edge is `startInVideo`, its width is the trimmed length.
 * Drag the body to reposition; drag the edge handles to trim head / tail.
 * Works with mouse and touch (pointer events).
 */
export function AudioPlacementTrack({
  url,
  kind,
  filmDuration,
  placement,
  onChange,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const waveContainerRef = useRef<HTMLDivElement | null>(null)
  const wsRef = useRef<WaveSurfer | null>(null)

  const [ready, setReady] = useState(false)
  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startPlacement: AudioPlacement
  } | null>(null)
  const [dragging, setDragging] = useState<DragMode>(null)

  const film = Math.max(0.1, filmDuration)
  const isMusic = kind === 'music'

  // Effective trim end falls back to the full source duration.
  const effTrimEnd =
    placement.trimEnd > placement.trimStart
      ? placement.trimEnd
      : placement.duration
  const regionLen = Math.max(0.1, effTrimEnd - placement.trimStart)
  const leftPct = Math.max(0, Math.min(100, (placement.startInVideo / film) * 100))
  const widthPct = Math.max(2, Math.min(100 - leftPct, (regionLen / film) * 100))

  // Build the waveform once per url.
  useEffect(() => {
    if (!waveContainerRef.current || !url) return
    setReady(false)
    const ws = WaveSurfer.create({
      container: waveContainerRef.current,
      url,
      height: 36,
      waveColor: isMusic ? 'rgba(16, 185, 129, 0.5)' : 'rgba(129, 140, 248, 0.5)',
      progressColor: isMusic ? 'rgba(16, 185, 129, 0.5)' : 'rgba(129, 140, 248, 0.5)',
      cursorWidth: 0,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: false,
    })
    wsRef.current = ws
    const onReady = () => {
      setReady(true)
      const d = ws.getDuration()
      if (Number.isFinite(d) && d > 0 && Math.abs(d - placement.duration) > 0.05) {
        onChange({
          ...placement,
          duration: d,
          trimEnd: placement.trimEnd > placement.trimStart ? placement.trimEnd : d,
        })
      }
    }
    ws.on('ready', onReady)
    return () => {
      try { ws.destroy() } catch { /* ignore */ }
      if (wsRef.current === ws) wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  const onPointerDown = useCallback(
    (mode: Exclude<DragMode, null>) => (e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      dragRef.current = { mode, startX: e.clientX, startPlacement: { ...placement } }
      setDragging(mode)
    },
    [placement],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      const track = trackRef.current
      if (!drag || !track) return
      const rect = track.getBoundingClientRect()
      if (rect.width <= 0) return
      const dxSec = ((e.clientX - drag.startX) / rect.width) * film
      const sp = drag.startPlacement
      const dur = sp.duration || regionLen
      const curEnd = sp.trimEnd > sp.trimStart ? sp.trimEnd : dur

      if (drag.mode === 'move') {
        const len = curEnd - sp.trimStart
        const next = Math.max(0, Math.min(film - len, sp.startInVideo + dxSec))
        onChange({ ...sp, startInVideo: next })
      } else if (drag.mode === 'trim-start') {
        // Trim from head: keep the film right-edge fixed.
        const newTrim = Math.max(0, Math.min(curEnd - 0.3, sp.trimStart + dxSec))
        const applied = newTrim - sp.trimStart
        const next = Math.max(0, sp.startInVideo + applied)
        onChange({ ...sp, trimStart: newTrim, startInVideo: next })
      } else if (drag.mode === 'trim-end') {
        const newEnd = Math.max(sp.trimStart + 0.3, Math.min(dur, curEnd + dxSec))
        // Don't let the region spill past the end of the film.
        const maxLen = film - sp.startInVideo
        const clampedEnd = Math.min(newEnd, sp.trimStart + maxLen)
        onChange({ ...sp, trimEnd: clampedEnd })
      }
    },
    [film, regionLen, onChange],
  )

  const endDrag = useCallback((e: React.PointerEvent) => {
    try { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId) } catch { /* ignore */ }
    dragRef.current = null
    setDragging(null)
  }, [])

  const label = useMemo(
    () => `${fmt(placement.startInVideo)} · ${fmt(regionLen)}`,
    [placement.startInVideo, regionLen],
  )

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          isMusic
            ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
            : 'border-indigo-300/30 bg-indigo-400/10 text-indigo-200'
        }`}
        title={isMusic ? 'Music placement' : 'Voiceover placement'}
      >
        {isMusic ? <Music className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
      </span>

      <div
        ref={trackRef}
        className="relative h-11 min-w-0 flex-1 overflow-hidden rounded-md border border-white/10 bg-black/40"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Faint full-timeline backdrop ticks */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:10%_100%]" />

        {/* Draggable audio region */}
        <div
          className={`absolute top-0 bottom-0 select-none rounded-md border ${
            isMusic ? 'border-emerald-400/50' : 'border-indigo-400/50'
          } ${dragging === 'move' ? 'cursor-grabbing' : 'cursor-grab'} ${
            ready ? '' : 'opacity-60'
          }`}
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            background: isMusic ? 'rgba(16,185,129,0.12)' : 'rgba(129,140,248,0.12)',
          }}
          onPointerDown={onPointerDown('move')}
        >
          <div ref={waveContainerRef} className="pointer-events-none h-full w-full overflow-hidden px-1" />

          {/* Left trim handle */}
          <div
            className={`absolute left-0 top-0 bottom-0 z-10 w-2.5 cursor-ew-resize touch-none rounded-l-md ${
              isMusic ? 'bg-emerald-400/70' : 'bg-indigo-400/70'
            }`}
            onPointerDown={onPointerDown('trim-start')}
            role="separator"
            aria-label="Trim start"
          />
          {/* Right trim handle */}
          <div
            className={`absolute right-0 top-0 bottom-0 z-10 w-2.5 cursor-ew-resize touch-none rounded-r-md ${
              isMusic ? 'bg-emerald-400/70' : 'bg-indigo-400/70'
            }`}
            onPointerDown={onPointerDown('trim-end')}
            role="separator"
            aria-label="Trim end"
          />

          {/* Floating live label while dragging */}
          {dragging ? (
            <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/15 bg-black/85 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white shadow">
              {label}
            </div>
          ) : null}
        </div>
      </div>

      <span className="hidden shrink-0 text-[10px] font-medium tabular-nums text-zinc-400 sm:block">
        {label}
      </span>
    </div>
  )
}

export default AudioPlacementTrack