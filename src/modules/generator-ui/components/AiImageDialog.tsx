import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Sparkles, Wand2, RefreshCw, Check, X, Brush, Eraser, ImagePlus, Download } from 'lucide-react'
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
import { normalizeImageAspect } from '@/modules/generator-ui/lib/normalizeImageAspect'

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

type AiReferenceImage = {
  name: string
  dataUrl: string
}

const MAX_REFERENCE_IMAGES = 4

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

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Failed to read image.'))
    }
    reader.onerror = () => reject(new Error('Failed to read image.'))
    reader.readAsDataURL(file)
  })
}

async function extractFnError(fnErr: unknown, fallback: string): Promise<string> {
  try {
    const ctx = (fnErr as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } })?.context
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json() as { error?: string } | null
      if (body?.error) return String(body.error)
    }
    if (ctx && typeof ctx.text === 'function') {
      const txt = await ctx.text()
      try {
        const parsed = JSON.parse(txt) as { error?: string }
        if (parsed?.error) return String(parsed.error)
      } catch { }
      if (txt) return txt
    }
  } catch { }
  if (fnErr instanceof Error && fnErr.message) return fnErr.message
  return fallback
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
  const [referenceImages, setReferenceImages] = useState<AiReferenceImage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isMaskMode, setIsMaskMode] = useState(false)
  const [brushSize, setBrushSize] = useState(36)
  const [hasMask, setHasMask] = useState(false)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const referenceInputRef = useRef<HTMLInputElement | null>(null)
  const isDrawingRef = useRef(false)

  useEffect(() => {
    if (open) {
      setAspect(defaultAspect)
      setPrompt('')
      setEditPrompt('')
      setImageDataUrl(null)
      setReferenceImages([])
      setError(null)
      setIsLoading(false)
      setIsSaving(false)
      setIsMaskMode(false)
      setHasMask(false)
      if (referenceInputRef.current) {
        referenceInputRef.current.value = ''
      }
    }
  }, [open, defaultAspect])

  useEffect(() => {
    setHasMask(false)
    setIsMaskMode(false)
    const c = maskCanvasRef.current
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
  }, [imageDataUrl])

  function syncCanvasSize() {
    const c = maskCanvasRef.current
    const img = imgRef.current
    if (!c || !img) return
    const w = img.naturalWidth || img.clientWidth
    const h = img.naturalHeight || img.clientHeight
    if (c.width !== w || c.height !== h) {
      const ctx = c.getContext('2d')
      const prev = ctx && c.width > 0 && c.height > 0
        ? ctx.getImageData(0, 0, c.width, c.height)
        : null
      c.width = w
      c.height = h
      if (prev && ctx) ctx.putImageData(prev, 0, 0)
    }
  }

  function pointerToCanvas(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = maskCanvasRef.current
    if (!c) return null
    const rect = c.getBoundingClientRect()
    const sx = c.width / rect.width
    const sy = c.height / rect.height
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy, scale: sx }
  }

  function paintAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = maskCanvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const p = pointerToCanvas(e)
    if (!p) return
    ctx.fillStyle = 'rgba(244, 63, 94, 0.85)'
    ctx.beginPath()
    ctx.arc(p.x, p.y, (brushSize * p.scale) / 2, 0, Math.PI * 2)
    ctx.fill()
    setHasMask(true)
  }

  function handleClearMask() {
    const c = maskCanvasRef.current
    if (!c) return
    c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    setHasMask(false)
  }

  function handleRemoveReference(index: number) {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index))
    if (referenceInputRef.current) {
      referenceInputRef.current.value = ''
    }
  }

  async function handleReferenceChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return

    const imageFiles = files.filter((f) => f.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      setError('Please choose image files.')
      event.target.value = ''
      return
    }

    setError(null)
    try {
      const remaining = MAX_REFERENCE_IMAGES - referenceImages.length
      if (remaining <= 0) {
        setError(`You can add up to ${MAX_REFERENCE_IMAGES} reference images.`)
        event.target.value = ''
        return
      }
      const toAdd = imageFiles.slice(0, remaining)
      const added = await Promise.all(
        toAdd.map(async (file) => ({ name: file.name, dataUrl: await fileToDataUrl(file) })),
      )
      setReferenceImages((prev) => [...prev, ...added])
      if (imageFiles.length > remaining) {
        setError(`Only ${MAX_REFERENCE_IMAGES} reference images are allowed. Extra files were ignored.`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read image.')
    } finally {
      event.target.value = ''
    }
  }

  function exportMaskDataUrl(): string | null {
    const c = maskCanvasRef.current
    if (!c || !hasMask) return null
    const out = document.createElement('canvas')
    out.width = c.width
    out.height = c.height
    const octx = out.getContext('2d')
    const ictx = c.getContext('2d')
    if (!octx || !ictx) return null
    const src = ictx.getImageData(0, 0, c.width, c.height)
    const dst = octx.createImageData(c.width, c.height)
    for (let i = 0; i < src.data.length; i += 4) {
      const a = src.data[i + 3]
      if (a > 0) {
        dst.data[i] = 255
        dst.data[i + 1] = 255
        dst.data[i + 2] = 255
        dst.data[i + 3] = 255
      } else {
        dst.data[i + 3] = 0
      }
    }
    octx.putImageData(dst, 0, 0)
    return out.toDataURL('image/png')
  }

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
  }

  async function compositeWithMask(originalUrl: string, editedUrl: string): Promise<string> {
    const maskC = maskCanvasRef.current
    if (!maskC || !hasMask) return editedUrl

    const [orig, edit] = await Promise.all([loadImage(originalUrl), loadImage(editedUrl)])
    const W = Math.max(orig.naturalWidth, edit.naturalWidth)
    const H = Math.max(orig.naturalHeight, edit.naturalHeight)

    const featherPx = Math.max(2, Math.round(W * 0.012))
    const maskScaled = document.createElement('canvas')
    maskScaled.width = W
    maskScaled.height = H
    const mctx = maskScaled.getContext('2d')!
    mctx.filter = `blur(${featherPx}px)`
    mctx.drawImage(maskC, 0, 0, W, H)
    mctx.filter = 'none'

    const editLayer = document.createElement('canvas')
    editLayer.width = W
    editLayer.height = H
    const ectx = editLayer.getContext('2d')!
    ectx.drawImage(edit, 0, 0, W, H)
    ectx.globalCompositeOperation = 'destination-in'
    ectx.drawImage(maskScaled, 0, 0)
    ectx.globalCompositeOperation = 'source-over'

    const out = document.createElement('canvas')
    out.width = W
    out.height = H
    const octx = out.getContext('2d')!
    octx.drawImage(orig, 0, 0, W, H)
    octx.drawImage(editLayer, 0, 0)
    return out.toDataURL('image/png')
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || isLoading) return
    setIsLoading(true)
    setError(null)
    try {
      let url: string | undefined

      if (referenceImages.length > 0) {
        const { data, error: fnErr } = await supabase.functions.invoke('ai-image-edit', {
          body: { prompt: prompt.trim(), imageUrls: referenceImages.map((r) => r.dataUrl), aspectRatio: aspect },
        })
        if (fnErr) {
          const msg = await extractFnError(fnErr, 'Failed to generate image.')
          throw new Error(msg)
        }
        url = (data as { dataUrl?: string } | null)?.dataUrl
      } else {
        const { data, error: fnErr } = await supabase.functions.invoke('ai-image-generate', {
          body: { prompt: prompt.trim(), aspectRatio: aspect },
        })
        if (fnErr) {
          const msg = await extractFnError(fnErr, 'Failed to generate image.')
          throw new Error(msg)
        }
        url = (data as { dataUrl?: string } | null)?.dataUrl
      }

      if (!url) throw new Error('No image returned.')
      const normalized = await normalizeImageAspect(url, aspect)
      setImageDataUrl(normalized)
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
      const originalUrl = imageDataUrl
      const maskUrl = exportMaskDataUrl()
      const { data, error: fnErr } = await supabase.functions.invoke('ai-image-edit', {
        body: { prompt: editPrompt.trim(), imageUrl: originalUrl, aspectRatio: aspect, ...(maskUrl ? { maskUrl } : {}) },
      })
      if (fnErr) {
        const msg = await extractFnError(fnErr, 'Failed to edit image.')
        throw new Error(msg)
      }
      const url = (data as { dataUrl?: string } | null)?.dataUrl
      if (!url) throw new Error('No image returned.')
      const normalizedEdit = await normalizeImageAspect(url, aspect)
      const finalUrl = maskUrl ? await compositeWithMask(originalUrl, normalizedEdit) : normalizedEdit
      setImageDataUrl(finalUrl)
      setEditPrompt('')
      handleClearMask()
      setIsMaskMode(false)
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
              <div className="relative">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A dark industrial workshop with glowing blue rebar stirrups, cinematic lighting…"
                  rows={5}
                  disabled={isLoading}
                  className="pb-14"
                />
                <input
                  ref={referenceInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleReferenceChange}
                />
                <button
                  type="button"
                  onClick={() => referenceInputRef.current?.click()}
                  disabled={isLoading || referenceImages.length >= MAX_REFERENCE_IMAGES}
                  className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  title="Upload reference images"
                >
                  <ImagePlus className="h-4 w-4" />
                  <span>{referenceImages.length > 0 ? 'Add image' : 'Upload image'}</span>
                </button>
              </div>
              {referenceImages.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {referenceImages.map((ref, index) => (
                    <div
                      key={`${ref.name}-${index}`}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                    >
                      <img
                        src={ref.dataUrl}
                        alt="Reference preview"
                        className="h-11 w-11 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-zinc-100">{ref.name}</div>
                        <div className="text-[11px] text-zinc-500">Using this image as a reference for generation.</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveReference(index)}
                        disabled={isLoading}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        title="Remove reference image"
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Remove reference image</span>
                      </button>
                    </div>
                  ))}
                  <p className="text-[11px] text-zinc-500">
                    {referenceImages.length} of {MAX_REFERENCE_IMAGES} reference images added.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-zinc-500">
                  Add up to {MAX_REFERENCE_IMAGES} reference images if you want the result to follow existing shots, products, or frames.
                </p>
              )}
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
              <img
                ref={imgRef}
                src={imageDataUrl}
                alt="Generated"
                className="absolute inset-0 h-full w-full object-contain"
                onLoad={syncCanvasSize}
              />
              <canvas
                ref={maskCanvasRef}
                className={`absolute inset-0 h-full w-full ${isMaskMode ? 'cursor-crosshair touch-none' : 'pointer-events-none'}`}
                style={{ mixBlendMode: 'normal' }}
                onPointerDown={(e) => {
                  if (!isMaskMode) return
                  const img = imgRef.current
                  if (!img || !img.naturalWidth) return
                  ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
                  isDrawingRef.current = true
                  syncCanvasSize()
                  paintAt(e)
                }}
                onPointerMove={(e) => {
                  if (!isMaskMode || !isDrawingRef.current) return
                  paintAt(e)
                }}
                onPointerUp={() => { isDrawingRef.current = false }}
                onPointerLeave={() => { isDrawingRef.current = false }}
              />
              {isLoading ? (
                <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-sm">
                  <LoaderCircle className="h-8 w-8 animate-spin text-white" />
                </div>
              ) : null}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-wide text-zinc-400">
                  Refine with AI (Nano Banana edit)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setIsMaskMode((m) => !m); requestAnimationFrame(() => syncCanvasSize()) }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                      isMaskMode
                        ? 'border-rose-300/50 bg-rose-400/15 text-rose-100'
                        : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20 hover:bg-white/[0.08]'
                    }`}
                    title={isMaskMode ? 'Exit edit-area mode' : 'Mark an area to edit'}
                  >
                    <Brush className="h-3.5 w-3.5" />
                    {isMaskMode ? 'Editing area' : 'Edit area'}
                  </button>
                  {isMaskMode ? (
                    <>
                      <label className="flex items-center gap-1 text-[11px] text-zinc-400">
                        Size
                        <input
                          type="range"
                          min={8}
                          max={80}
                          step={2}
                          value={brushSize}
                          onChange={(e) => setBrushSize(Number(e.target.value))}
                          className="h-1 w-20 accent-rose-400"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleClearMask}
                        disabled={!hasMask}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-40"
                        title="Clear mask"
                      >
                        <Eraser className="h-3.5 w-3.5" />
                        Clear
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <Textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder={hasMask ? 'Describe the change for the masked area…' : 'Make the lighting warmer, add subtle dust particles…'}
                rows={3}
                disabled={isLoading || isSaving}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-500">
                  {hasMask ? 'Edit applied only inside the painted area.' : 'Tip: paint an area to edit only that region.'}
                </span>
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!imageDataUrl) return
                    try {
                      const blob = await dataUrlToBlob(imageDataUrl)
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `ai-image-${Date.now()}.png`
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                      URL.revokeObjectURL(url)
                    } catch {
                      window.open(imageDataUrl, '_blank', 'noopener,noreferrer')
                    }
                  }}
                  disabled={!imageDataUrl || isLoading || isSaving}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
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
