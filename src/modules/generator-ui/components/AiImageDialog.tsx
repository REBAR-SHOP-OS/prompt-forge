import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Sparkles, Wand2, RefreshCw, Check, X, Brush, Eraser, ImagePlus, Download, Palette, Package } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/integrations/supabase/client'
import { normalizeImageAspect } from '@/modules/generator-ui/lib/normalizeImageAspect'

type ThemeOption = { id: string; faLabel: string; enLabel: string; descriptor: string; swatch: string }

const THEME_OPTIONS: ThemeOption[] = [
  { id: 'minimalist', faLabel: 'مینیمال', enLabel: 'Minimalist', descriptor: 'minimalist style, clean composition, lots of negative space, simple shapes', swatch: 'linear-gradient(135deg, #f5f5f4 0%, #e7e5e4 60%, #d6d3d1 100%)' },
  { id: 'dark-moody', faLabel: 'تاریک و مرموز', enLabel: 'Dark & Moody', descriptor: 'dark moody atmosphere, dramatic low-key lighting, deep shadows', swatch: 'radial-gradient(120% 120% at 30% 20%, #3f3f46 0%, #18181b 55%, #09090b 100%)' },
  { id: 'pop-art', faLabel: 'پاپ‌آرت', enLabel: 'Vibrant & Pop-Art', descriptor: 'vibrant pop-art style, bold saturated colors, halftone dots, high contrast', swatch: 'conic-gradient(from 45deg, #ef4444, #f59e0b, #22c55e, #3b82f6, #ec4899, #ef4444)' },
  { id: 'vintage', faLabel: 'وینتیج و نوستالژیک', enLabel: 'Vintage & Retro', descriptor: 'vintage retro aesthetic, faded film tones, nostalgic warm grain', swatch: 'linear-gradient(135deg, #d8c3a5 0%, #c79f7f 50%, #8a6d52 100%)' },
  { id: 'editorial', faLabel: 'مجله‌ای', enLabel: 'Magazine / Editorial', descriptor: 'magazine editorial layout, refined typography, premium fashion photography look', swatch: 'linear-gradient(135deg, #fafafa 0%, #e5e5e5 50%, #171717 100%)' },
  { id: 'corporate', faLabel: 'شرکتی و تجاری', enLabel: 'Corporate', descriptor: 'corporate business style, clean professional, polished commercial look', swatch: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #93c5fd 100%)' },
  { id: 'typography', faLabel: 'تایپوگرافی و متن‌محور', enLabel: 'Typography', descriptor: 'typography-driven design, bold expressive lettering, text as the focal element', swatch: 'linear-gradient(135deg, #ffffff 0%, #ffffff 50%, #000000 50%, #000000 100%)' },
  { id: 'pastel', faLabel: 'پاستلی', enLabel: 'Pastel', descriptor: 'soft pastel palette, gentle muted colors, airy light tones', swatch: 'linear-gradient(135deg, #fbcfe8 0%, #ddd6fe 40%, #bfdbfe 70%, #bbf7d0 100%)' },
  { id: 'monochrome', faLabel: 'مونوکروم و تک‌رنگ', enLabel: 'Monochrome', descriptor: 'monochrome single-color palette, tonal variations of one hue', swatch: 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 50%, #bae6fd 100%)' },
  { id: 'black-white', faLabel: 'سیاه و سفید', enLabel: 'Black & White', descriptor: 'black and white, high-contrast grayscale, dramatic monochrome photography', swatch: 'linear-gradient(135deg, #ffffff 0%, #9ca3af 50%, #000000 100%)' },
  { id: 'neon', faLabel: 'نئونی', enLabel: 'Neon', descriptor: 'vibrant neon glow, cyberpunk color palette, luminous accents', swatch: 'radial-gradient(120% 120% at 25% 20%, #db2777 0%, #7c3aed 45%, #0e7490 80%, #09090b 100%)' },
  { id: 'earthy', faLabel: 'طبیعت و ارگانیک', enLabel: 'Earthy / Organic', descriptor: 'earthy organic style, natural textures, warm botanical tones', swatch: 'linear-gradient(135deg, #4d7c0f 0%, #84a98c 50%, #a3886b 100%)' },
  { id: 'watercolor', faLabel: 'آبرنگی', enLabel: 'Watercolor', descriptor: 'watercolor painting style, soft bleeding washes, hand-painted texture', swatch: 'radial-gradient(80% 80% at 30% 30%, #93c5fd 0%, transparent 55%), radial-gradient(80% 80% at 75% 70%, #f9a8d4 0%, transparent 55%), linear-gradient(135deg, #fef9c3, #ddd6fe)' },
  { id: 'grunge', faLabel: 'گرانج و خشن', enLabel: 'Grunge', descriptor: 'grunge style, rough distressed textures, gritty raw aesthetic', swatch: 'linear-gradient(135deg, #57534e 0%, #292524 50%, #1c1917 100%)' },
  { id: 'collage', faLabel: 'کلاژ و ترکیب تصاویر', enLabel: 'Collage', descriptor: 'collage style, mixed-media cut-and-paste composition, layered fragments', swatch: 'conic-gradient(from 0deg, #f59e0b 0deg 90deg, #3b82f6 90deg 180deg, #ec4899 180deg 270deg, #22c55e 270deg 360deg)' },
  { id: 'grid', faLabel: 'پازلی و پیوسته', enLabel: 'Puzzle / Grid', descriptor: 'grid-based puzzle layout, modular tiled composition', swatch: 'repeating-linear-gradient(0deg, #1e293b 0 14px, #334155 14px 16px), repeating-linear-gradient(90deg, transparent 0 14px, #334155 14px 16px)' },
  { id: 'flat', faLabel: 'فلت‌دیزاین', enLabel: 'Flat Design', descriptor: 'flat design, solid colors, no gradients, simple vector shapes', swatch: 'linear-gradient(90deg, #ef4444 0 33%, #facc15 33% 66%, #3b82f6 66% 100%)' },
  { id: '3d', faLabel: 'سه‌بعدی', enLabel: '3D Elements', descriptor: '3D rendered elements, realistic depth, soft studio lighting', swatch: 'radial-gradient(60% 60% at 35% 30%, #c4b5fd 0%, #7c3aed 55%, #312e81 100%)' },
  { id: 'gradient', faLabel: 'گرادیانت و شیب‌رنگ', enLabel: 'Gradient', descriptor: 'smooth gradient color transitions, blended hues, modern gradient mesh', swatch: 'linear-gradient(135deg, #6366f1 0%, #ec4899 50%, #f59e0b 100%)' },
  { id: 'checkerboard', faLabel: 'شطرنجی', enLabel: 'Checkerboard', descriptor: 'checkerboard pattern motif, bold geometric tiling', swatch: 'repeating-conic-gradient(#0a0a0a 0 25%, #fafafa 0 50%) 0 / 24px 24px' },
  { id: 'doodle', faLabel: 'دودل و خط‌خطی دست‌نویس', enLabel: 'Doodle', descriptor: 'hand-drawn doodle style, playful sketchy line art', swatch: 'repeating-linear-gradient(45deg, #fde68a 0 10px, #fef3c7 10px 20px)' },
  { id: 'cinematic', faLabel: 'سینمایی و فیلم', enLabel: 'Cinematic', descriptor: 'cinematic film look, anamorphic widescreen, dramatic color grading', swatch: 'linear-gradient(180deg, #0a0a0a 0 18%, #0c4a6e 18%, #f59e0b 82%, #0a0a0a 82% 100%)' },
  { id: 'geometric', faLabel: 'اشکال هندسی', enLabel: 'Geometric', descriptor: 'geometric abstract style, precise shapes, structured composition', swatch: 'conic-gradient(from 90deg at 50% 50%, #0ea5e9, #6366f1, #f43f5e, #0ea5e9)' },
  { id: 'framed', faLabel: 'قاب‌دار و حاشیه‌دار', enLabel: 'Borders & Frames', descriptor: 'decorative bordered frame composition, ornamental edges', swatch: 'linear-gradient(#1c1917, #1c1917) padding-box, linear-gradient(135deg, #fbbf24, #b45309) border-box' },
  { id: 'metallic', faLabel: 'متالیک و براق', enLabel: 'Metallic', descriptor: 'metallic glossy finish, shiny reflective chrome and gold surfaces', swatch: 'linear-gradient(135deg, #e5e7eb 0%, #9ca3af 30%, #f9fafb 50%, #6b7280 70%, #d1d5db 100%)' },
  { id: 'glassmorphism', faLabel: 'گلس‌مورفیسم', enLabel: 'Glassmorphism', descriptor: 'glassmorphism style, frosted translucent glass, soft blur and light', swatch: 'radial-gradient(70% 70% at 30% 25%, rgba(255,255,255,0.55) 0%, transparent 55%), linear-gradient(135deg, #38bdf8, #818cf8)' },
  { id: 'duotone', faLabel: 'دوآتون و دورنگ', enLabel: 'Duotone', descriptor: 'duotone two-color treatment, bold paired color overlay', swatch: 'linear-gradient(135deg, #db2777 0%, #1e3a8a 100%)' },
  { id: 'comic', faLabel: 'کمیک‌بوک و کارتونی', enLabel: 'Comic Book', descriptor: 'comic book style, bold outlines, cartoon shading, speech-bubble energy', swatch: 'radial-gradient(#1d4ed8 20%, transparent 21%) 0 0 / 14px 14px, linear-gradient(135deg, #fde047, #f59e0b)' },
  { id: 'bullet-journal', faLabel: 'بولت‌ژورنال', enLabel: 'Bullet Journal', descriptor: 'bullet journal aesthetic, hand-lettered planner spread, doodled icons', swatch: 'radial-gradient(#cbd5e1 12%, transparent 13%) 0 0 / 16px 16px, #f8fafc' },
  { id: 'scrapbook', faLabel: 'اسکرپ‌بوک و دفترچه خاطرات', enLabel: 'Scrapbook', descriptor: 'scrapbook diary style, paper textures, tape, stickers and handwritten notes', swatch: 'linear-gradient(135deg, #fecaca 0%, #fde68a 40%, #bbf7d0 70%, #bfdbfe 100%)' },
]

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

type AiProductOption = {
  id: string
  url: string
  title: string | null
  description?: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string | null
  defaultAspect: AiImageAspect
  onSaved: (row: AiImageSavedRow) => void
  products?: AiProductOption[]
}

type AiReferenceImage = {
  name: string
  dataUrl: string
  isProduct?: boolean
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
      } catch { /* noop */ }
      if (txt) return txt
    }
  } catch { /* noop */ }
  if (fnErr instanceof Error && fnErr.message) return fnErr.message
  return fallback
}

export default function AiImageDialog({
  open,
  onOpenChange,
  userId,
  defaultAspect,
  onSaved,
  products = [],
}: Props) {
  const [aspect, setAspect] = useState<AiImageAspect>(defaultAspect)
  const [prompt, setPrompt] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [referenceImages, setReferenceImages] = useState<AiReferenceImage[]>([])
  const [refineReferenceImages, setRefineReferenceImages] = useState<AiReferenceImage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [productMenuOpen, setProductMenuOpen] = useState(false)
  const [productLoadingId, setProductLoadingId] = useState<string | null>(null)
  const [isWritingPrompt, setIsWritingPrompt] = useState(false)

  const [isMaskMode, setIsMaskMode] = useState(false)
  const [brushSize, setBrushSize] = useState(36)
  const [hasMask, setHasMask] = useState(false)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const referenceInputRef = useRef<HTMLInputElement | null>(null)
  const refineReferenceInputRef = useRef<HTMLInputElement | null>(null)
  const isDrawingRef = useRef(false)

  useEffect(() => {
    if (open) {
      setAspect(defaultAspect)
      setPrompt('')
      setEditPrompt('')
      setImageDataUrl(null)
      setReferenceImages([])
      setRefineReferenceImages([])
      setError(null)
      setIsLoading(false)
      setIsSaving(false)
      setIsMaskMode(false)
      setHasMask(false)
      setSelectedTheme(null)
      setThemeMenuOpen(false)
      if (referenceInputRef.current) {
        referenceInputRef.current.value = ''
      }
      if (refineReferenceInputRef.current) {
        refineReferenceInputRef.current.value = ''
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

  async function handleSelectProduct(product: AiProductOption) {
    setError(null)
    if (referenceImages.length >= MAX_REFERENCE_IMAGES) {
      setError(`You can add up to ${MAX_REFERENCE_IMAGES} reference images.`)
      return
    }
    if (referenceImages.some((r) => r.dataUrl === product.url || r.name === (product.title ?? product.id))) {
      setProductMenuOpen(false)
      return
    }
    setProductLoadingId(product.id)
    try {
      const res = await fetch(product.url)
      if (!res.ok) throw new Error('Could not load the product image.')
      const blob = await res.blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result)
          else reject(new Error('Failed to read product image.'))
        }
        reader.onerror = () => reject(new Error('Failed to read product image.'))
        reader.readAsDataURL(blob)
      })
      setReferenceImages((prev) =>
        prev.length >= MAX_REFERENCE_IMAGES
          ? prev
          : [...prev, { name: product.title || 'Product', dataUrl, isProduct: true }],
      )
      setProductMenuOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add product image.')
    } finally {
      setProductLoadingId(null)
    }
  }

  async function handleWritePrompt() {
    setError(null)
    const theme = selectedTheme ? THEME_OPTIONS.find((t) => t.id === selectedTheme) : null
    if (referenceImages.length === 0 && !theme && prompt.trim().length === 0) {
      setError('Add a reference image, a product, or pick a theme first so I can write a prompt.')
      return
    }
    setIsWritingPrompt(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('write-image-prompt', {
        body: {
          referenceImages: referenceImages.map((r) => r.dataUrl),
          themeDescriptor: theme?.descriptor ?? '',
          themeLabel: theme?.enLabel ?? '',
          existingPrompt: prompt.trim(),
        },
      })
      if (fnError) {
        setError(await extractFnError(fnError, 'Could not write a prompt. Try again.'))
        return
      }
      const written = typeof (data as { prompt?: unknown })?.prompt === 'string'
        ? (data as { prompt: string }).prompt.trim()
        : ''
      if (!written) {
        setError('The AI returned an empty prompt. Try again.')
        return
      }
      setPrompt(written)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write a prompt.')
    } finally {
      setIsWritingPrompt(false)
    }
  }



  function handleRemoveRefineReference(index: number) {
    setRefineReferenceImages((prev) => prev.filter((_, i) => i !== index))
    if (refineReferenceInputRef.current) {
      refineReferenceInputRef.current.value = ''
    }
  }

  async function handleRefineReferenceChange(event: React.ChangeEvent<HTMLInputElement>) {
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
      const remaining = MAX_REFERENCE_IMAGES - refineReferenceImages.length
      if (remaining <= 0) {
        setError(`You can add up to ${MAX_REFERENCE_IMAGES} reference images.`)
        event.target.value = ''
        return
      }
      const toAdd = imageFiles.slice(0, remaining)
      const added = await Promise.all(
        toAdd.map(async (file) => ({ name: file.name, dataUrl: await fileToDataUrl(file) })),
      )
      setRefineReferenceImages((prev) => [...prev, ...added])
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

      const themeDescriptor = selectedTheme
        ? THEME_OPTIONS.find((t) => t.id === selectedTheme)?.descriptor
        : null
      const finalPrompt = themeDescriptor
        ? `${prompt.trim()}, ${themeDescriptor}`
        : prompt.trim()

      if (referenceImages.length > 0) {
        const { data, error: fnErr } = await supabase.functions.invoke('ai-image-edit', {
          body: { prompt: finalPrompt, imageUrls: referenceImages.map((r) => r.dataUrl), aspectRatio: aspect },
        })
        if (fnErr) {
          const msg = await extractFnError(fnErr, 'Failed to generate image.')
          throw new Error(msg)
        }
        url = (data as { dataUrl?: string } | null)?.dataUrl
      } else {
        const { data, error: fnErr } = await supabase.functions.invoke('ai-image-generate', {
          body: { prompt: finalPrompt, aspectRatio: aspect },
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
      // When a mask is painted, the edit is scoped to the masked region of the
      // original only. Otherwise, send any attached reference images alongside.
      const refUrls = refineReferenceImages.map((r) => r.dataUrl)
      const body = maskUrl
        ? { prompt: editPrompt.trim(), imageUrl: originalUrl, aspectRatio: aspect, maskUrl }
        : { prompt: editPrompt.trim(), imageUrls: [originalUrl, ...refUrls], aspectRatio: aspect }
      const { data, error: fnErr } = await supabase.functions.invoke('ai-image-edit', { body })
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
      setRefineReferenceImages([])
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
    setRefineReferenceImages([])
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
                />
                <input
                  ref={referenceInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleReferenceChange}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => referenceInputRef.current?.click()}
                  disabled={isLoading || referenceImages.length >= MAX_REFERENCE_IMAGES}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  title="Upload reference images"
                >
                  <ImagePlus className="h-4 w-4" />
                  <span>{referenceImages.length > 0 ? 'Add image' : 'Upload image'}</span>
                </button>
                <Popover open={themeMenuOpen} onOpenChange={setThemeMenuOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={isLoading}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        selectedTheme
                          ? 'border-amber-300/60 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20'
                          : 'border-white/10 bg-black/40 text-zinc-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white'
                      }`}
                      title="Pick a visual theme"
                    >
                      <Palette className="h-4 w-4" />
                      <span>
                        {selectedTheme
                          ? THEME_OPTIONS.find((t) => t.id === selectedTheme)?.enLabel ?? 'Theme'
                          : 'Pick a theme'}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[24rem] p-3">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-xs font-medium text-zinc-300">Choose a theme</span>
                      {selectedTheme ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTheme(null)
                            setThemeMenuOpen(false)
                          }}
                          className="text-[11px] text-rose-300 hover:text-rose-200"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1">
                      {THEME_OPTIONS.map((t) => {
                        const active = selectedTheme === t.id
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setSelectedTheme(t.id)
                              setThemeMenuOpen(false)
                            }}
                            className={`group flex flex-col gap-1.5 rounded-xl border p-1.5 text-left transition ${
                              active
                                ? 'border-amber-300/70 bg-amber-300/10'
                                : 'border-white/10 hover:border-white/25 hover:bg-white/[0.05]'
                            }`}
                          >
                            <span className="relative block h-16 w-full overflow-hidden rounded-lg border border-white/10">
                              <span
                                className="absolute inset-0"
                                style={{ background: t.swatch }}
                              />
                              {active ? (
                                <span className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-black">
                                  <Check className="h-3.5 w-3.5" />
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={`block truncate text-xs font-medium ${
                                active ? 'text-amber-100' : 'text-zinc-200'
                              }`}
                            >
                              {t.enLabel}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                <Popover open={productMenuOpen} onOpenChange={setProductMenuOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={isLoading || referenceImages.length >= MAX_REFERENCE_IMAGES}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      title="Use one of your saved products as a reference"
                    >
                      <Package className="h-4 w-4" />
                      <span>Select product</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[22rem] p-3">
                    <div className="mb-2 px-1 text-xs font-medium text-zinc-300">
                      Choose a product
                    </div>
                    {products.length === 0 ? (
                      <p className="px-1 py-4 text-center text-[11px] text-zinc-500">
                        No saved products yet. Add product photos in Storage → Products first.
                      </p>
                    ) : (
                      <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1">
                        {products.map((p) => {
                          const busy = productLoadingId === p.id
                          return (
                            <button
                              key={p.id}
                              type="button"
                              disabled={busy || productLoadingId !== null}
                              onClick={() => void handleSelectProduct(p)}
                              className="group flex flex-col gap-1.5 rounded-xl border border-white/10 p-1.5 text-left transition hover:border-white/25 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <span className="relative block h-20 w-full overflow-hidden rounded-lg border border-white/10 bg-black/30">
                                <img
                                  src={p.url}
                                  alt={p.title ?? 'Product'}
                                  className="absolute inset-0 h-full w-full object-cover"
                                />
                                {busy ? (
                                  <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                                    <LoaderCircle className="h-5 w-5 animate-spin text-white" />
                                  </span>
                                ) : null}
                              </span>
                              <span className="block truncate text-xs font-medium text-zinc-200">
                                {p.title || 'Product'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                <button
                  type="button"
                  onClick={() => void handleWritePrompt()}
                  disabled={isLoading || isWritingPrompt}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:border-amber-300/70 hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Write a professional prompt from your references & theme"
                >
                  {isWritingPrompt ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  <span>{isWritingPrompt ? 'Writing…' : 'Write prompt'}</span>
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
                  <input
                    ref={refineReferenceInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleRefineReferenceChange}
                  />
                  <button
                    type="button"
                    onClick={() => refineReferenceInputRef.current?.click()}
                    disabled={isLoading || isSaving || isMaskMode || refineReferenceImages.length >= MAX_REFERENCE_IMAGES}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                    title={isMaskMode ? 'Exit edit-area mode to add reference images' : 'Add reference images'}
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    Add image
                  </button>
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
              {refineReferenceImages.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {refineReferenceImages.map((ref, index) => (
                    <div
                      key={`${ref.name}-${index}`}
                      className="group relative h-14 w-14 overflow-hidden rounded-lg border border-white/10"
                      title={ref.name}
                    >
                      <img src={ref.dataUrl} alt="Reference" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveRefineReference(index)}
                        disabled={isLoading || isSaving}
                        className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-zinc-200 transition hover:bg-black/90 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        title="Remove reference image"
                      >
                        <X className="h-3 w-3" />
                        <span className="sr-only">Remove reference image</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
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
