import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Scissors, Trash2, Volume2, VolumeX } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  type CutRange,
  normalizeCuts,
  totalKeptDuration,
  trimVideoLocally,
} from '@/modules/generator-ui/lib/trimVideo'

interface ClipTrimmerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Source video URL (proxied/playable). */
  videoUrl: string
  /** Friendly label shown in the header. */
  title?: string
  /** Called with the produced blob + new duration after Apply succeeds. */
  onApply: (blob: Blob, newDuration: number, ext: 'mp4' | 'webm') => void | Promise<void>
}

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

export default function ClipTrimmerDialog({
  open,
  onOpenChange,
  videoUrl,
  title,
  onApply,
}: ClipTrimmerDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [cuts, setCuts] = useState<CutRange[]>([])
  const [pendingStart, setPendingStart] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [muteAudio, setMuteAudio] = useState(false)

  // Reset on open.
  useEffect(() => {
    if (!open) {
      setCuts([])
      setPendingStart(null)
      setBusy(false)
      setError(null)
      setCurrentTime(0)
    }
  }, [open])

  // Skip cut ranges during preview playback (live preview of the result).
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => {
      setCurrentTime(v.currentTime)
      const norm = normalizeCuts(cuts, duration || v.duration || 0)
      const inside = norm.find((c) => v.currentTime >= c.start - 0.02 && v.currentTime < c.end)
      if (inside) {
        try { v.currentTime = Math.min(v.duration || inside.end, inside.end + 0.01) } catch { /* noop */ }
      }
    }
    v.addEventListener('timeupdate', onTime)
    return () => v.removeEventListener('timeupdate', onTime)
  }, [cuts, duration])

  const norm = useMemo(() => normalizeCuts(cuts, duration), [cuts, duration])
  const newDuration = useMemo(() => totalKeptDuration(norm, duration), [norm, duration])

  const onTrackClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const track = trackRef.current
    const v = videoRef.current
    if (!track || !v || !duration) return
    const rect = track.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const t = ratio * duration
    try { v.currentTime = t } catch { /* noop */ }
    setCurrentTime(t)
  }

  const markFromHere = () => {
    if (!duration) return
    if (pendingStart === null) {
      setPendingStart(currentTime)
    } else {
      const a = Math.min(pendingStart, currentTime)
      const b = Math.max(pendingStart, currentTime)
      if (b - a >= 0.05) {
        setCuts((prev) => [...prev, { start: a, end: b }])
      }
      setPendingStart(null)
    }
  }

  const removeCut = (idx: number) => {
    setCuts((prev) => prev.filter((_, i) => i !== idx))
  }

  const apply = async () => {
    setError(null)
    setBusy(true)
    try {
      if (norm.length === 0) {
        throw new Error('No ranges to remove. Mark at least one cut first.')
      }
      const result = await trimVideoLocally(videoUrl, norm)
      await onApply(result.blob, result.duration, result.extension)
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message ?? 'Trim failed')
    } finally {
      setBusy(false)
    }
  }

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0
  const pendingPct = pendingStart !== null && duration > 0 ? (pendingStart / duration) * 100 : null

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-4 w-4" /> Trim clip
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {title ?? 'Mark ranges to remove from this clip and apply changes.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-white/10 bg-black">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              className="mx-auto block max-h-[50vh] w-full bg-black"
              onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-400 tabular-nums">
              <span>{fmtTime(currentTime)} / {fmtTime(duration)}</span>
              <span>New length: <span className="font-medium text-zinc-200">{fmtTime(newDuration)}</span></span>
            </div>
            <div
              ref={trackRef}
              onClick={onTrackClick}
              role="slider"
              aria-label="Timeline"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={currentTime}
              className="relative h-8 w-full cursor-pointer overflow-hidden rounded-full bg-white/10"
            >
              {/* progress */}
              <div
                className="absolute inset-y-0 left-0 bg-emerald-400/30"
                style={{ width: `${playheadPct}%` }}
              />
              {/* cut ranges */}
              {duration > 0 && norm.map((c, i) => {
                const left = (c.start / duration) * 100
                const w = ((c.end - c.start) / duration) * 100
                return (
                  <div
                    key={i}
                    className="absolute inset-y-0 bg-rose-500/60 ring-1 ring-rose-300/60"
                    style={{ left: `${left}%`, width: `${w}%` }}
                    title={`${fmtTime(c.start)} → ${fmtTime(c.end)}`}
                  />
                )
              })}
              {/* pending start marker */}
              {pendingPct !== null ? (
                <div
                  className="absolute inset-y-0 w-0.5 bg-amber-300"
                  style={{ left: `${pendingPct}%` }}
                />
              ) : null}
              {/* playhead */}
              <div
                className="absolute inset-y-0 w-0.5 bg-white"
                style={{ left: `${playheadPct}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={markFromHere} disabled={busy || !duration}>
              <Plus className="mr-1 h-4 w-4" />
              {pendingStart === null ? 'Mark cut start' : 'Set cut end'}
            </Button>
            {pendingStart !== null ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setPendingStart(null)} disabled={busy}>
                Cancel mark
              </Button>
            ) : null}
            {cuts.length > 0 ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setCuts([])} disabled={busy}>
                Clear all
              </Button>
            ) : null}
          </div>

          {norm.length > 0 ? (
            <ul className="max-h-32 space-y-1 overflow-auto rounded-md border border-white/10 bg-white/[0.02] p-2 text-xs">
              {norm.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-white/5">
                  <span className="tabular-nums text-zinc-300">
                    {fmtTime(c.start)} → {fmtTime(c.end)}
                    <span className="ml-2 text-zinc-500">({fmtTime(c.end - c.start)})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCut(i)}
                    className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-rose-500/10 hover:text-rose-300"
                    aria-label="Remove range"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500">
              Use the timeline + “Mark cut start / Set cut end” to mark ranges. Marked ranges play through during preview as if removed.
            </p>
          )}

          {error ? (
            <p className="text-xs text-rose-300">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={apply} disabled={busy || norm.length === 0}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Rendering…</> : 'Apply changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
