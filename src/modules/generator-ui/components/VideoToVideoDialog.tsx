import { useEffect, useState } from 'react'
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
import { editVideoWithAi } from '@/modules/generator-ui/lib/editVideoWithAi'
import { stringifyAny } from '@/modules/generator-ui/lib/transcodeToMp4'

interface VideoToVideoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  videoUrl: string
  title?: string
  onApply: (blob: Blob, newDuration: number, ext: 'mp4') => void | Promise<void>
}

type Stage = 'idle' | 'loading' | 'extracting' | 'editing' | 'encoding' | 'saving'

const STAGE_LABEL: Record<Stage, string> = {
  idle: '',
  loading: 'Preparing…',
  extracting: 'Extracting frames…',
  editing: 'Editing frames',
  encoding: 'Encoding video…',
  saving: 'Saving…',
}

export default function VideoToVideoDialog({
  open,
  onOpenChange,
  videoUrl,
  title,
  onApply,
}: VideoToVideoDialogProps) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [progress, setProgress] = useState(0)
  const [frameCount, setFrameCount] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setPrompt('')
      setBusy(false)
      setStage('idle')
      setProgress(0)
      setFrameCount(null)
      setError(null)
    }
  }, [open])

  const apply = async () => {
    setError(null)
    if (!prompt.trim()) {
      setError('Write what you want to change in the video.')
      return
    }
    setBusy(true)
    setStage('loading')
    setProgress(0)
    try {
      const result = await editVideoWithAi(videoUrl, {
        prompt: prompt.trim(),
        fps: 4,
        maxDurationSec: 6,
        concurrency: 3,
        onProgress: (info) => {
          setStage(info.stage)
          setProgress(info.ratio)
          if (info.stage === 'editing' && info.total) {
            setFrameCount({ done: info.done ?? 0, total: info.total })
          }
        },
      })
      setStage('saving')
      setProgress(1)
      await onApply(result.blob, result.duration, 'mp4')
      onOpenChange(false)
    } catch (e) {
      console.error('[VideoToVideoDialog] edit failed', e)
      setError(stringifyAny(e) || 'AI video edit failed')
    } finally {
      setBusy(false)
    }
  }

  const stageLabel = (() => {
    if (stage === 'editing' && frameCount) {
      return `${STAGE_LABEL[stage]} ${frameCount.done}/${frameCount.total}`
    }
    if (stage === 'idle') return ''
    return `${STAGE_LABEL[stage]} ${Math.round(progress * 100)}%`
  })()

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-rose-400" /> Video-to-Video Editing
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {title ?? 'Describe how to transform this video. The AI edits up to 8 seconds at 6 fps.'}
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
            placeholder="e.g. Make it a Studio-Ghibli style anime, soft lighting, dreamy colors."
            rows={3}
            disabled={busy}
            className="resize-none"
          />
          <p className="text-xs text-zinc-500">
            Tip: shorter, visual prompts work best. Each frame is edited independently, so very fast motion may look slightly inconsistent.
          </p>
          {busy ? (
            <div className="space-y-1">
              <p className="text-xs text-zinc-300">{stageLabel}</p>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-rose-400 transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
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
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {stageLabel || 'Working…'}</>
            ) : 'Apply AI edit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
