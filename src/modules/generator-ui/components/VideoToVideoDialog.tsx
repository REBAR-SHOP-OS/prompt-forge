import { useEffect, useRef, useState } from 'react'
import { Crop, Loader2, Wand2, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { supabase } from '@/integrations/supabase/client'
import { jobOrchestratorGateway } from '@/modules/job-orchestrator/gateway'
import type { JobDetail, CreateJobResult, AspectRatio } from '@/modules/job-orchestrator/contract'

const FRAMES_BUCKET = 'wan-frames'

interface VideoToVideoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  videoUrl: string
  userId: string | null | undefined
  sourceAspectRatio?: AspectRatio | '1:1' | null
  title?: string
  onJobCreated: (seeded: JobDetail, ratio: '9:16' | '16:9') => void
}

interface Region {
  xPct: number
  yPct: number
  wPct: number
  hPct: number
}

function veoAspect(r: AspectRatio | '1:1' | null | undefined): '9:16' | '16:9' {
  if (r === '9:16') return '9:16'
  if (r === '1:1') return '9:16'
  return '16:9'
}

function describeRegion(r: Region): string {
  const cx = r.xPct + r.wPct / 2
  const cy = r.yPct + r.hPct / 2
  const horiz = cx < 33 ? 'left' : cx > 66 ? 'right' : 'center'
  const vert = cy < 33 ? 'top' : cy > 66 ? 'bottom' : 'middle'
  return `${vert} ${horiz}`
}

function buildAugmentedPrompt(userPrompt: string, region: Region | null, timeRange: [number, number] | null, duration: number | null): string {
  const parts: string[] = [userPrompt.trim()]
  if (region) {
    const x1 = Math.round(region.xPct)
    const x2 = Math.round(region.xPct + region.wPct)
    const y1 = Math.round(region.yPct)
    const y2 = Math.round(region.yPct + region.hPct)
    parts.push(
      `— Target region: focus the change on the area in the ${describeRegion(region)} of the frame ` +
      `(approx. ${x1}%–${x2}% from the left, ${y1}%–${y2}% from the top). A rose-colored rectangle ` +
      `on the reference frame marks this area. Leave everything outside this area unchanged.`
    )
  }
  if (timeRange && duration && (timeRange[0] > 0.1 || timeRange[1] < duration - 0.1)) {
    parts.push(
      `— Target time window: apply the change between ${timeRange[0].toFixed(1)}s and ${timeRange[1].toFixed(1)}s of the clip. ` +
      `Before and after that window the scene should match the original.`
    )
  }
  parts.push(
    '— Keep the exact same composition, camera angle, framing, lighting, subject identity ' +
    'and motion as the reference frame. Only change what was explicitly requested above. ' +
    'Do not add new subjects. Do not change the environment unless asked.'
  )
  return parts.join('\n\n')
}

async function snapshotFirstFrame(src: string, region: Region | null): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = src

    let settled = false
    const fail = (msg: string) => {
      if (settled) return
      settled = true
      try { video.remove() } catch { /* ignore */ }
      reject(new Error(msg))
    }
    const done = (blob: Blob) => {
      if (settled) return
      settled = true
      try { video.remove() } catch { /* ignore */ }
      resolve(blob)
    }

    const t = setTimeout(() => fail('Could not read the video within 20s'), 20_000)

    video.addEventListener('error', () => {
      clearTimeout(t)
      fail('Video could not be loaded (network or CORS).')
    })

    video.addEventListener('loadeddata', () => {
      try {
        video.currentTime = Math.min(0.05, Math.max(0, (video.duration || 0) - 0.05))
      } catch { /* ignore */ }
    })

    video.addEventListener('seeked', () => {
      try {
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) {
          clearTimeout(t)
          fail('Video has no readable dimensions.')
          return
        }
        const maxSide = 1280
        const scale = Math.min(1, maxSide / Math.max(w, h))
        const cw = Math.round(w * scale)
        const ch = Math.round(h * scale)
        const canvas = document.createElement('canvas')
        canvas.width = cw
        canvas.height = ch
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          clearTimeout(t)
          fail('Browser cannot create a 2D canvas.')
          return
        }
        ctx.drawImage(video, 0, 0, cw, ch)
        if (region) {
          const rx = Math.round((region.xPct / 100) * cw)
          const ry = Math.round((region.yPct / 100) * ch)
          const rw = Math.round((region.wPct / 100) * cw)
          const rh = Math.round((region.hPct / 100) * ch)
          ctx.fillStyle = 'rgba(244, 63, 94, 0.18)'
          ctx.fillRect(rx, ry, rw, rh)
          ctx.lineWidth = Math.max(3, Math.round(Math.min(cw, ch) * 0.006))
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.95)'
          ctx.strokeRect(rx, ry, rw, rh)
        }
        canvas.toBlob(
          (blob) => {
            clearTimeout(t)
            if (!blob) fail('Could not encode the captured frame.')
            else done(blob)
          },
          'image/jpeg',
          0.92,
        )
      } catch (e) {
        clearTimeout(t)
        fail(e instanceof Error ? e.message : 'Frame capture failed.')
      }
    })
  })
}

export default function VideoToVideoDialog({
  open,
  onOpenChange,
  videoUrl,
  userId,
  sourceAspectRatio,
  title,
  onJobCreated,
}: VideoToVideoDialogProps) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const cancelled = useRef(false)

  const [selectMode, setSelectMode] = useState(false)
  const [region, setRegion] = useState<Region | null>(null)
  const [draft, setDraft] = useState<Region | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [duration, setDuration] = useState<number | null>(null)
  const [timeRange, setTimeRange] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (!open) {
      setPrompt('')
      setBusy(false)
      setStage('')
      setError(null)
      cancelled.current = false
      setSelectMode(false)
      setRegion(null)
      setDraft(null)
      setDuration(null)
      setTimeRange(null)
    }
  }, [open])

  const handleLoadedMeta = () => {
    const d = videoRef.current?.duration
    if (d && Number.isFinite(d) && d > 0) {
      setDuration(d)
      setTimeRange([0, d])
    }
  }

  const beginDrag = (e: React.PointerEvent) => {
    if (!selectMode || !overlayRef.current) return
    e.preventDefault()
    try { videoRef.current?.pause() } catch { /* ignore */ }
    const rect = overlayRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    dragStart.current = { x, y }
    setDraft({ xPct: x, yPct: y, wPct: 0, hPct: 0 })
    overlayRef.current.setPointerCapture(e.pointerId)
  }
  const moveDrag = (e: React.PointerEvent) => {
    if (!selectMode || !dragStart.current || !overlayRef.current) return
    const rect = overlayRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    const s = dragStart.current
    const xPct = Math.max(0, Math.min(s.x, x))
    const yPct = Math.max(0, Math.min(s.y, y))
    const wPct = Math.min(100, Math.abs(x - s.x))
    const hPct = Math.min(100, Math.abs(y - s.y))
    setDraft({ xPct, yPct, wPct, hPct })
  }
  const endDrag = (e: React.PointerEvent) => {
    if (!selectMode) return
    overlayRef.current?.releasePointerCapture(e.pointerId)
    dragStart.current = null
    if (draft && draft.wPct >= 3 && draft.hPct >= 3) {
      setRegion(draft)
    }
    setDraft(null)
    setSelectMode(false)
  }

  const apply = async () => {
    setError(null)
    const trimmed = prompt.trim()
    if (!trimmed) {
      setError('Write what you want to change in the video.')
      return
    }
    if (!userId) {
      setError('You need to be signed in to edit videos.')
      return
    }

    setBusy(true)
    cancelled.current = false
    try {
      setStage('Capturing reference frame…')
      const blob = await snapshotFirstFrame(videoUrl, region)
      if (cancelled.current) return

      setStage('Uploading reference frame…')
      const path = `${userId}/v2v-frame-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`
      const { error: upErr } = await supabase.storage
        .from(FRAMES_BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { data: pub } = supabase.storage.from(FRAMES_BUCKET).getPublicUrl(path)
      const firstFrameUrl = pub.publicUrl
      if (cancelled.current) return

      setStage('Sending to video model…')
      const ratio = veoAspect(sourceAspectRatio)
      const augmentedPrompt = buildAugmentedPrompt(trimmed, region, timeRange, duration)

      const created: CreateJobResult = await jobOrchestratorGateway.createJob({
        providerKey: 'flow',
        requestedModel: 'flow-video-1',
        prompt: augmentedPrompt,
        firstFrameUrl,
        aspectRatio: ratio,
        durationSeconds: 5,
      })

      const now = new Date().toISOString()
      const seeded: JobDetail = {
        id: created.jobId,
        status: created.status,
        input_prompt: trimmed,
        provider_key: created.providerKey,
        model_key: created.resolvedModel,
        provider_job_id: null,
        first_frame_url: firstFrameUrl,
        last_frame_url: null,
        requested_duration: 5,
        requested_aspect_ratio: ratio,
        created_at: now,
        updated_at: now,
        video: null,
        requestId: created.requestId,
      }

      onJobCreated(seeded, ratio)
      onOpenChange(false)
    } catch (e) {
      console.error('[VideoToVideoDialog] edit failed', e)
      setError(e instanceof Error ? e.message : 'AI video edit failed')
    } finally {
      setBusy(false)
      setStage('')
    }
  }

  const activeRect = draft ?? region

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy && !o) cancelled.current = true
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-rose-400" /> Video-to-Video Editing
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {title ?? 'Describe how to transform this video. Optionally mark the area and time window you want changed so the AI can target the edit.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black">
            <video
              ref={videoRef}
              src={videoUrl}
              controls={!selectMode}
              playsInline
              preload="metadata"
              onLoadedMetadata={handleLoadedMeta}
              className="mx-auto block max-h-[40vh] w-full bg-black"
            />
            <div
              ref={overlayRef}
              onPointerDown={beginDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              className={`absolute inset-0 ${selectMode ? 'cursor-crosshair' : 'pointer-events-none'}`}
              style={{ touchAction: selectMode ? 'none' : 'auto' }}
            >
              {activeRect ? (
                <div
                  className="absolute border-2 border-dashed border-rose-400 bg-rose-400/15"
                  style={{
                    left: `${activeRect.xPct}%`,
                    top: `${activeRect.yPct}%`,
                    width: `${activeRect.wPct}%`,
                    height: `${activeRect.hPct}%`,
                  }}
                />
              ) : null}
              {selectMode ? (
                <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-rose-500/90 px-3 py-1 text-[11px] font-medium text-white shadow">
                  Drag to select the area to edit
                </div>
              ) : null}
            </div>
            {region && !selectMode ? (
              <button
                type="button"
                onClick={() => setRegion(null)}
                className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[11px] text-white hover:bg-black/90"
              >
                <X className="h-3 w-3" /> Clear area
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectMode((v) => !v)
                if (!selectMode) setRegion(null)
              }}
              disabled={busy}
              className={selectMode ? 'border-rose-400 text-rose-300' : ''}
            >
              <Crop className="mr-1.5 h-3.5 w-3.5" />
              {selectMode ? 'Cancel selection' : region ? 'Reselect area' : 'Select area to edit'}
            </Button>
            {region ? (
              <span className="text-xs text-zinc-400">
                Area: {describeRegion(region)} ({Math.round(region.wPct)}×{Math.round(region.hPct)}%)
              </span>
            ) : (
              <span className="text-xs text-zinc-500">Optional — helps the AI target the change.</span>
            )}
          </div>

          {duration && timeRange ? (
            <div className="space-y-1.5 rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span>Time window for the edit</span>
                <span className="font-mono text-zinc-400">
                  {timeRange[0].toFixed(1)}s – {timeRange[1].toFixed(1)}s
                </span>
              </div>
              <Slider
                min={0}
                max={duration}
                step={0.1}
                value={timeRange}
                onValueChange={(v) => {
                  if (v.length === 2) setTimeRange([v[0], v[1]] as [number, number])
                }}
                disabled={busy}
              />
              <p className="text-[11px] text-zinc-500">
                The change is described to the AI as happening only in this part of the clip.
              </p>
            </div>
          ) : null}

          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Change the machine color to blue. Replace the ball with a basketball."
            rows={3}
            disabled={busy}
            className="resize-none"
          />
          <p className="text-xs text-zinc-500">
            Tip: short, visual instructions work best. The AI sees the first frame (with your selected area highlighted) and your instruction.
          </p>
          {busy ? (
            <div className="flex items-center gap-2 text-xs text-zinc-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{stage}</span>
            </div>
          ) : null}
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button
            onClick={apply}
            disabled={busy || !prompt.trim()}
            className="bg-rose-500 text-white hover:bg-rose-500/90"
          >
            {busy ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
            ) : 'Apply AI edit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
