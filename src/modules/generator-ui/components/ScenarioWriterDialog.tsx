import { useEffect, useRef, useState } from 'react'
import { Clapperboard, LoaderCircle, RefreshCw, Copy, Check, Wand2, Send, ImagePlus, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/integrations/supabase/client'

export type ScenarioDuration = 5 | 10 | 15 | 45

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDuration: ScenarioDuration
  userId: string | null
  onUseAsPrompt: (scenario: string, imageUrl?: string) => void
  onSendScenes?: (scenes: string[], imageUrl?: string) => void | Promise<void>

}

const DURATIONS: ScenarioDuration[] = [5, 10, 15, 45]
const SCENE_RANGES = ['0–15s', '15–30s', '30–45s']
const FRAMES_BUCKET = 'wan-frames'

export default function ScenarioWriterDialog({
  open,
  onOpenChange,
  defaultDuration,
  userId,
  onUseAsPrompt,
  onSendScenes,
}: Props) {
  const [duration, setDuration] = useState<ScenarioDuration>(defaultDuration)
  const [idea, setIdea] = useState('')
  const [isWriting, setIsWriting] = useState(false)
  const [scenes, setScenes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null) // -1 = "all"
  const [isSending, setIsSending] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setDuration(defaultDuration)
      setError(null)
    }
  }, [open, defaultDuration])

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  async function handlePickImage(file: File | undefined) {
    if (!file) return
    if (!userId) {
      setError('Please sign in to attach an image.')
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('Only image files are supported.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image too large (max 10MB).')
      return
    }
    setError(null)
    const localUrl = URL.createObjectURL(file)
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImagePreviewUrl(localUrl)
    setUploadedImageUrl(null)
    setIsUploadingImage(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const storagePath = `${userId}/scenario-ref-${Date.now()}-${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(FRAMES_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { data } = supabase.storage.from(FRAMES_BUCKET).getPublicUrl(storagePath)
      setUploadedImageUrl(data.publicUrl)
    } catch (e) {
      setError((e as Error).message ?? 'Image upload failed')
      setImagePreviewUrl(null)
      setUploadedImageUrl(null)
    } finally {
      setIsUploadingImage(false)
    }
  }

  function clearImage() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImagePreviewUrl(null)
    setUploadedImageUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function generate() {
    if ((!idea.trim() && !uploadedImageUrl) || isWriting) return
    setIsWriting(true)
    setError(null)
    setScenes([])
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('scenario-write', {
        body: {
          idea: idea.trim() || 'Generate a scenario based on the attached reference image.',
          durationSeconds: duration,
          imageUrl: uploadedImageUrl ?? undefined,
        },
      })
      if (invokeErr) {
        setError(invokeErr.message || 'Failed to write scenario')
        return
      }
      const payload = data as { scenario?: string; scenes?: string[]; warning?: string } | null
      const list = (payload?.scenes ?? []).map((s) => s.trim()).filter(Boolean)
      if (list.length === 0) {
        setError('Empty AI response')
        return
      }
      setScenes(list)
      if (payload?.warning) setError(payload.warning)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to write scenario')
    } finally {
      setIsWriting(false)
    }
  }

  async function copyText(text: string, idx: number) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(idx)
      setTimeout(() => setCopiedIndex((c) => (c === idx ? null : c)), 1500)
    } catch {
      /* noop */
    }
  }

  function handleUseAsPrompt() {
    if (scenes.length === 0) return
    onUseAsPrompt(scenes.join('\n\n'), uploadedImageUrl ?? undefined)
    onOpenChange(false)
  }

  async function handleSendAll() {
    if (scenes.length !== 3 || !onSendScenes || isSending) return
    setIsSending(true)
    setError(null)
    try {
      await onSendScenes(scenes)
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to send to Pending')
    } finally {
      setIsSending(false)
    }
  }

  function reset() {
    setIdea('')
    setScenes([])
    setError(null)
    setCopiedIndex(null)
    setIsSending(false)
    clearImage()
  }

  const isSplit = duration === 45 && scenes.length === 3
  const concatenated = scenes.join('\n\n')
  const canGenerate = (idea.trim().length > 0 || Boolean(uploadedImageUrl)) && !isUploadingImage

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="max-w-2xl border-white/10 bg-[#0b0c0e]/95 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-amber-300" aria-hidden="true" />
            Scenario Writer
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Pick a duration, describe your idea (any language), and get an English
            cinematic scenario tuned to that length. Optionally attach a reference image.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Duration
            </div>
            <div
              role="radiogroup"
              aria-label="Scenario duration"
              className="inline-flex rounded-full border border-white/10 bg-black/20 p-1 text-xs font-semibold"
            >
              {DURATIONS.map((sec) => {
                const active = duration === sec
                return (
                  <button
                    key={sec}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDuration(sec)}
                    className={`rounded-full px-3 py-1.5 transition ${
                      active
                        ? 'bg-zinc-100 text-zinc-950'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {sec}s
                  </button>
                )
              })}
            </div>
            {duration === 45 ? (
              <p className="mt-2 text-xs text-zinc-500">
                Will be split into 3 sequential 15s scenes and sent as 3 cards.
              </p>
            ) : null}
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Your idea
            </div>
            <div className="relative">
              <Textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                rows={4}
                placeholder="Describe your idea (any language)…"
                className="min-h-[100px] border-white/10 bg-black/30 pb-12 text-zinc-100"
              />
              <div className="absolute bottom-2 left-2 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePickImage(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  title="Attach a reference image"
                  aria-label="Attach a reference image"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  {isUploadingImage ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                {imagePreviewUrl ? (
                  <div className="relative">
                    <img
                      src={imagePreviewUrl}
                      alt="Reference"
                      className="h-8 w-8 rounded-md border border-white/10 object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearImage}
                      aria-label="Remove image"
                      className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900 text-zinc-200 ring-1 ring-white/20 hover:bg-zinc-800"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
                {uploadedImageUrl ? (
                  <span className="text-[10px] uppercase tracking-wide text-emerald-300/80">
                    Image attached
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {error ? (
            <p className="text-xs leading-5 text-rose-300">{error}</p>
          ) : null}

          {isSplit ? (
            <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
              {scenes.map((text, i) => (
                <div
                  key={i}
                  className="rounded-md border border-white/10 bg-black/30 p-3"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Scene {i + 1} ({SCENE_RANGES[i]})
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => copyText(text, i)}
                      disabled={isWriting || isSending}
                    >
                      {copiedIndex === i ? (
                        <Check className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                      )}
                      {copiedIndex === i ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <p dir="ltr" className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          ) : scenes.length > 0 ? (
            <div className="rounded-md border border-white/10 bg-black/30 p-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Scenario ({duration}s)
              </div>
              <p dir="ltr" className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">
                {scenes[0]}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {scenes.length > 0 ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyText(concatenated, -1)}
                disabled={isWriting || isSending}
              >
                {copiedIndex === -1 ? (
                  <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                {copiedIndex === -1 ? 'Copied' : isSplit ? 'Copy all' : 'Copy'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={generate}
                disabled={isWriting || isSending || !canGenerate}
              >
                {isWriting ? (
                  <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                Regenerate
              </Button>
              {isSplit && onSendScenes ? (
                <Button size="sm" onClick={handleSendAll} disabled={isWriting || isSending}>
                  {isSending ? (
                    <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                  )}
                  Send all to Pending
                </Button>
              ) : (
                <Button size="sm" onClick={handleUseAsPrompt} disabled={isWriting || isSending}>
                  <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
                  Use as prompt
                </Button>
              )}
            </>
          ) : (
            <Button onClick={generate} disabled={isWriting || !canGenerate} size="sm">
              {isWriting ? (
                <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
              )}
              Write scenario
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
