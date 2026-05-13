import { useEffect, useState } from 'react'
import { LoaderCircle, Sparkles, Wand2, RefreshCw, Check, X } from 'lucide-react'
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

const USER_IMAGES_BUCKET = 'user-images'

export type AiImageAspect = '1:1' | '9:16' | '16:9'

export type AiImageSavedRow = {
  id: string
  storage_path: string
  created_at: string
  still_duration_seconds: number
  width?: number | null
  height?: number | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string | null
  defaultAspect: AiImageAspect
  onSaved: (row: AiImageSavedRow) => void
}

const ASPECT_OPTIONS: { value: AiImageAspect; label: string; sub: string; box: string }[] = [
  { value: '1:1', label: '1:1', sub: 'Square', box: 'aspect-square' },
  { value: '9:16', label: '9:16', sub: 'Reels', box: 'aspect-[9/16]' },
  { value: '16:9', label: '16:9', sub: 'YouTube', box: 'aspect-video' },
]

function aspectBoxClass(a: AiImageAspect) {
  return ASPECT_OPTIONS.find((o) => o.value === a)?.box ?? 'aspect-square'
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return await res.blob()
}

export default function AiImageDialog({
  open,
  onOpenChange,
  userId,
  defaultAspect,
  onSaved,
}: Props) {
  const [aspect, setAspect] = useState<AiImageAspect>(defaultAspect)
  const [prompt, setPrompt] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setAspect(defaultAspect)
      setPrompt('')
      setEditPrompt('')
      setImageDataUrl(null)
      setError(null)
      setIsLoading(false)
      setIsSaving(false)
    }
  }, [open, defaultAspect])

  const handleGenerate = async () => {
    if (!prompt.trim() || isLoading) return
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('ai-image-generate', {
        body: { prompt: prompt.trim(), aspectRatio: aspect },
      })
      if (fnErr) throw fnErr
      const url = (data as { dataUrl?: string } | null)?.dataUrl
      if (!url) throw new Error('No image returned.')
      setImageDataUrl(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate image.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefine = async () => {
    if (!editPrompt.trim() || !imageDataUrl || isLoading) return
    setIsLoading(true)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('ai-image-edit', {
        body: { prompt: editPrompt.trim(), imageUrl: imageDataUrl },
      })
      if (fnErr) throw fnErr
      const url = (data as { dataUrl?: string } | null)?.dataUrl
      if (!url) throw new Error('No image returned.')
      setImageDataUrl(url)
      setEditPrompt('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to edit image.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUse = async () => {
    if (!imageDataUrl || !userId || isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      const blob = await dataUrlToBlob(imageDataUrl)
      const path = `${userId}/ai-${crypto.randomUUID()}.png`
      const up = await supabase.storage
        .from(USER_IMAGES_BUCKET)
        .upload(path, blob, { contentType: blob.type || 'image/png', upsert: false })
      if (up.error) throw up.error
      const { data: pub } = supabase.storage.from(USER_IMAGES_BUCKET).getPublicUrl(path)
      const publicUrl = pub.publicUrl
      const { data: row, error: insErr } = await supabase
        .from('generator_user_images')
        .insert({
          user_id: userId,
          storage_path: publicUrl,
          size_bytes: blob.size,
          mime_type: blob.type || 'image/png',
        })
        .select('id, storage_path, created_at, still_duration_seconds, width, height')
        .single()
      if (insErr) throw insErr
      onSaved(row as AiImageSavedRow)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save image.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDiscard = () => {
    setImageDataUrl(null)
    setEditPrompt('')
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-300" />
            Generate image with AI
          </DialogTitle>
          <DialogDescription>
            Pick an aspect ratio, describe the image, then optionally refine it with another prompt.
          </DialogDescription>
        </DialogHeader>

        {!imageDataUrl ? (
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-zinc-400">Aspect ratio</div>
              <div className="grid grid-cols-3 gap-2">
                {ASPECT_OPTIONS.map((opt) => {
                  const active = aspect === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAspect(opt.value)}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        active
                          ? 'border-amber-300/60 bg-amber-300/10 text-amber-100'
                          : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-[11px] text-zinc-400">{opt.sub}</div>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-zinc-400">Prompt</div>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A dark industrial workshop with glowing blue rebar stirrups, cinematic lighting…"
                rows={5}
                disabled={isLoading}
              />
            </div>
            {error ? (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                {error}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={!prompt.trim() || isLoading}>
                {isLoading ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className={`relative w-full overflow-hidden rounded-xl border border-white/10 bg-black ${aspectBoxClass(
                aspect,
              )}`}
            >
              <img src={imageDataUrl} alt="Generated" className="absolute inset-0 h-full w-full object-contain" />
              {isLoading ? (
                <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-sm">
                  <LoaderCircle className="h-8 w-8 animate-spin text-white" />
                </div>
              ) : null}
            </div>

            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-zinc-400">
                Refine with AI (Nano Banana edit)
              </div>
              <Textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="Make the lighting warmer, add subtle dust particles…"
                rows={3}
                disabled={isLoading || isSaving}
              />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleRefine}
                  disabled={!editPrompt.trim() || isLoading || isSaving}
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Apply edit
                </Button>
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDiscard}
                  disabled={isLoading || isSaving}
                >
                  <X className="mr-2 h-4 w-4" />
                  Discard
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={isLoading || isSaving || !prompt.trim()}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate
                </Button>
              </div>
              <Button onClick={handleUse} disabled={isLoading || isSaving || !userId}>
                {isSaving ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Use this image
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
