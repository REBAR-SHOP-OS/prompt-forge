import { useEffect, useRef, useState } from 'react'
import { Loader2, Wand2 } from 'lucide-react'
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
import { supabase } from '@/integrations/supabase/client'
import { jobOrchestratorGateway } from '@/modules/job-orchestrator/gateway'
import type { JobDetail, CreateJobResult, AspectRatio } from '@/modules/job-orchestrator/contract'

const FRAMES_BUCKET = 'wan-frames'

interface VideoToVideoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Playable source URL (already proxied / same-origin where possible). */
  videoUrl: string
  /** Authenticated user id — required to upload to wan-frames/{userId}/. */
  userId: string | null | undefined
  /** Source job; used to inherit the original aspect ratio. */
  sourceAspectRatio?: AspectRatio | '1:1' | null
  title?: string
  /** Called when the new Veo job has been created and added to Pending. */
  onJobCreated: (seeded: JobDetail, ratio: '9:16' | '16:9') => void
}

// Veo supports 16:9 and 9:16 only. Map 1:1 → 9:16 (closer to mobile/social).
function veoAspect(r: AspectRatio | '1:1' | null | undefined): '9:16' | '16:9' {
  if (r === '9:16') return '9:16'
  if (r === '1:1') return '9:16'
  return '16:9'
}

async function snapshotFirstFrame(src: string): Promise<Blob> {
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

    // Hard timeout so we never hang the UI on a stalled video.
    const t = setTimeout(() => fail('Could not read the video within 20s'), 20_000)

    video.addEventListener('error', () => {
      clearTimeout(t)
      fail('Video could not be loaded (network or CORS).')
    })

    video.addEventListener('loadeddata', () => {
      // Some browsers need a tiny seek to ensure a decoded frame is ready.
      try {
        video.currentTime = Math.min(0.05, Math.max(0, (video.duration || 0) - 0.05))
      } catch {
        // ignore — will fall back to current frame on `seeked` not firing
      }
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
        // Cap longest side at 1280 to keep the upload small.
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

  useEffect(() => {
    if (!open) {
      setPrompt('')
      setBusy(false)
      setStage('')
      setError(null)
      cancelled.current = false
    }
  }, [open])

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
      // Step 1: analyze the full source video so Veo gets full-clip context.
      setStage('Analyzing video…')
      let analysisBlock = ''
      try {
        const { data: analyzeData, error: analyzeErr } = await supabase.functions.invoke(
          'video-analyze',
          { body: { videoUrl } },
        )
        if (analyzeErr) throw analyzeErr
        const a = (analyzeData as { analysis?: Record<string, string> })?.analysis ?? {}
        const lines = [
          a.summary && `- Summary: ${a.summary}`,
          a.subjects && `- Subjects: ${a.subjects}`,
          a.camera && `- Camera: ${a.camera}`,
          a.motion && `- Motion: ${a.motion}`,
          a.lighting && `- Lighting: ${a.lighting}`,
          a.environment && `- Environment: ${a.environment}`,
          a.key_moments && `- Key moments: ${a.key_moments}`,
        ].filter(Boolean)
        if (lines.length) analysisBlock = lines.join('\n')
      } catch (e) {
        console.warn('[VideoToVideoDialog] analyze failed, falling back to frame-only', e)
      }
      if (cancelled.current) return

      setStage('Capturing first frame…')
      const blob = await snapshotFirstFrame(videoUrl)
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
      const augmentedPrompt =
        `USER EDIT INSTRUCTION:\n${trimmed}\n\n` +
        (analysisBlock
          ? `ORIGINAL VIDEO ANALYSIS (preserve everything below unless explicitly changed above):\n${analysisBlock}\n\n`
          : '') +
        'Rules: keep the exact composition, camera angle, framing, lighting, subject identity ' +
        'and motion as the original video. Only apply the user edit instruction above. ' +
        'Do not add new subjects. Do not change the environment unless asked.'

      const created: CreateJobResult = await jobOrchestratorGateway.createJob({
        providerKey: 'flow',
        requestedModel: 'flow-video-1', // routes to veo-3.1-generate-preview in the adapter
        prompt: augmentedPrompt,
        firstFrameUrl,
        aspectRatio: ratio,
        durationSeconds: 5,
      })

      // Seed a JobDetail so the parent can append it to Pending right away.
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
      const raw = e instanceof Error ? e.message : 'AI video edit failed'
      setError(raw)
    } finally {
      setBusy(false)
      setStage('')
    }
  }

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
            {title ?? 'Describe how to transform this video. We send the first frame and your instruction to Veo so it preserves composition, camera, and motion.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-white/10 bg-black">
            <video
              src={videoUrl}
              controls
              playsInline
              preload="metadata"
              className="mx-auto block max-h-[40vh] w-full bg-black"
            />
          </div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Change the machine color to blue. Replace the ball with a basketball."
            rows={3}
            disabled={busy}
            className="resize-none"
          />
          <p className="text-xs text-zinc-500">
            Tip: short, visual instructions work best. The model uses your video's first frame as the reference and generates a fresh 8-second clip with the change applied.
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
