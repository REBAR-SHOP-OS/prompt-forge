import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Music, Mic, Settings2, Volume2, VolumeX } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'

export type AudioPlacement = {
  /** Seconds into the film where the track begins. */
  startInVideo: number
  /** Seconds trimmed from the head of the source. */
  trimStart: number
  /** Seconds at which the source is cut off (0 = full source duration). */
  trimEnd: number
  /** Source duration in seconds (read from the decoded audio). */
  duration: number
  /** Track volume 0..1 (default 1). */
  volume: number
  /** Whether the track is muted. */
  muted: boolean
}

export const DEFAULT_PLACEMENT: AudioPlacement = {
  startInVideo: 0,
  trimStart: 0,
  trimEnd: 0,
  duration: 0,
  volume: 1,
  muted: false,
}

/** Normalize older/partial placement objects to the full shape. */
export function normalizePlacement(p?: Partial<AudioPlacement> | null): AudioPlacement {
  return {
    startInVideo: Math.max(0, p?.startInVideo ?? 0),
    trimStart: Math.max(0, p?.trimStart ?? 0),
    trimEnd: Math.max(0, p?.trimEnd ?? 0),
    duration: Math.max(0, p?.duration ?? 0),
    volume: p?.volume == null ? 1 : Math.max(0, Math.min(1, p.volume)),
    muted: Boolean(p?.muted),
  }
}

type Props = {
  url: string
  kind: 'music' | 'voiceover'
  /** Total film duration in seconds (the timeline this track is placed on). */
  filmDuration: number
  placement: AudioPlacement
  onChange: (next: AudioPlacement) => void
  /** Whether this bar is the selected one (visual highlight). */
  selected?: boolean
  onSelect?: () => void
}

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Parse "mm:ss", "ss", or "1.5" into seconds. Returns null if invalid. */
function parseTime(raw: string): number | null {
  const v = raw.trim()
  if (v === '') return null
  if (v.includes(':')) {
    const [m, s] = v.split(':')
    const mi = Number(m)
    const se = Number(s)
    if (!Number.isFinite(mi) || !Number.isFinite(se)) return null
    return mi * 60 + se
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

type DragMode = 'move' | 'trim-start' | 'trim-end' | null

/**
 * Draggable / trimmable audio region placed along the video timeline.
 *
 * The full bar represents the whole film duration. The highlighted region is
 * the audio: its left edge is `startInVideo`, its width is the trimmed length.
 * Drag the body to reposition; drag the edge handles to trim head / tail; use
 * the settings popover to type exact start / end / trim / volume values.
 * Works with mouse and touch (pointer events).
 */
export function AudioPlacementTrack({
  url,
  kind,
  filmDuration,
  placement,
  onChange,
  selected,
  onSelect,
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
  const endInVideo = placement.startInVideo + regionLen
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
    (mode: Exclude<DragMode, null>) => (e: ReactPointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      onSelect?.()
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
      dragRef.current = { mode, startX: e.clientX, startPlacement: { ...placement } }
      setDragging(mode)
    },
    [placement, onSelect],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
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
        let next = Math.max(0, Math.min(film - len, sp.startInVideo + dxSec))
        // Light snap to film start.
        if (Math.abs(next) < film * 0.01) next = 0
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

  const endDrag = useCallback((e: ReactPointerEvent) => {
    try { (e.target as HTMLElement).releasePointerCapture?.(e.pointerId) } catch { /* ignore */ }
    dragRef.current = null
    setDragging(null)
  }, [])

  const dragLabel = useMemo(
    () => `${fmt(placement.startInVideo)} → ${fmt(endInVideo)}`,
    [placement.startInVideo, endInVideo],
  )
  const rangeLabel = useMemo(
    () => `${fmt(placement.startInVideo)} - ${fmt(endInVideo)}`,
    [placement.startInVideo, endInVideo],
  )

  // ---- Manual field handlers (popover) -----------------------------------
  const dur = placement.duration || regionLen
  const setStart = (raw: string) => {
    const t = parseTime(raw)
    if (t == null) return
    const len = effTrimEnd - placement.trimStart
    onChange({ ...placement, startInVideo: Math.max(0, Math.min(film - len, t)) })
  }
  const setEnd = (raw: string) => {
    const t = parseTime(raw)
    if (t == null) return
    const len = Math.max(0.3, t - placement.startInVideo)
    const newTrimEnd = Math.min(dur, placement.trimStart + len)
    onChange({ ...placement, trimEnd: Math.max(placement.trimStart + 0.3, newTrimEnd) })
  }
  const setDurationField = (raw: string) => {
    const t = parseTime(raw)
    if (t == null || t <= 0) return
    const newTrimEnd = Math.min(dur, placement.trimStart + t)
    onChange({ ...placement, trimEnd: Math.max(placement.trimStart + 0.3, newTrimEnd) })
  }
  const setTrimStart = (raw: string) => {
    const t = parseTime(raw)
    if (t == null) return
    const v = Math.max(0, Math.min(effTrimEnd - 0.3, t))
    onChange({ ...placement, trimStart: v })
  }
  const setTrimEnd = (raw: string) => {
    const t = parseTime(raw)
    if (t == null) return
    const v = Math.max(placement.trimStart + 0.3, Math.min(dur, t))
    onChange({ ...placement, trimEnd: v })
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-1 py-0.5 ${
        selected ? 'bg-white/[0.04] ring-1 ring-white/15' : ''
      }`}
      onPointerDown={() => onSelect?.()}
    >
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
          } ${placement.muted ? 'opacity-40' : ''}`}
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
              {dragLabel}
            </div>
          ) : null}
        </div>
      </div>

      <span className="hidden shrink-0 text-[10px] font-medium tabular-nums text-zinc-400 sm:block">
        {rangeLabel}
      </span>

      {/* Settings popover: exact numeric timing + volume */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Audio timing settings"
            title="Timing & volume"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-black/40 text-zinc-300 transition hover:border-white/25 hover:text-white"
            onClick={() => onSelect?.()}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-64 space-y-3 border-white/10 bg-[#0b0c0f] text-zinc-200"
        >
          <p className="text-xs font-semibold text-zinc-300">
            {isMusic ? 'Music timing' : 'Voiceover timing'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-400">Start on video (s)</Label>
              <Input
                type="text"
                defaultValue={placement.startInVideo.toFixed(2)}
                key={`s-${placement.startInVideo.toFixed(2)}`}
                onBlur={(e) => setStart(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="h-8 bg-black/40 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-400">End on video (s)</Label>
              <Input
                type="text"
                defaultValue={endInVideo.toFixed(2)}
                key={`e-${endInVideo.toFixed(2)}`}
                onBlur={(e) => setEnd(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="h-8 bg-black/40 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-400">Duration (s)</Label>
              <Input
                type="text"
                defaultValue={regionLen.toFixed(2)}
                key={`d-${regionLen.toFixed(2)}`}
                onBlur={(e) => setDurationField(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="h-8 bg-black/40 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-zinc-400">Trim start (s)</Label>
              <Input
                type="text"
                defaultValue={placement.trimStart.toFixed(2)}
                key={`ts-${placement.trimStart.toFixed(2)}`}
                onBlur={(e) => setTrimStart(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="h-8 bg-black/40 text-xs"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-[10px] text-zinc-400">Trim end (s)</Label>
              <Input
                type="text"
                defaultValue={effTrimEnd.toFixed(2)}
                key={`te-${effTrimEnd.toFixed(2)}`}
                onBlur={(e) => setTrimEnd(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="h-8 bg-black/40 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5 border-t border-white/10 pt-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                {placement.muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                Volume
              </Label>
              <button
                type="button"
                onClick={() => onChange({ ...placement, muted: !placement.muted })}
                className="text-[10px] font-medium text-zinc-300 hover:text-white"
              >
                {placement.muted ? 'Unmute' : 'Mute'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Slider
                value={[Math.round((placement.muted ? 0 : placement.volume) * 100)]}
                min={0}
                max={100}
                step={1}
                onValueChange={([v]) =>
                  onChange({ ...placement, volume: v / 100, muted: v === 0 })
                }
              />
              <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-zinc-300">
                {Math.round((placement.muted ? 0 : placement.volume) * 100)}%
              </span>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default AudioPlacementTrack
