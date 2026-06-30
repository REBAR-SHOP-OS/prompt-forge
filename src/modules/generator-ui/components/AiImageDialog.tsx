import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Sparkles, Wand2, RefreshCw, Check, X, Brush, Eraser, ImagePlus, Download, Palette, Package, Clapperboard, ShieldCheck, ShieldAlert, Languages } from 'lucide-react'
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
import { proxiedVideoUrl } from '@/modules/generator-ui/lib/proxiedVideoUrl'

import themeMinimalist from '@/assets/theme-previews/minimalist.jpg'
import themeDarkMoody from '@/assets/theme-previews/dark-moody.jpg'
import themeCinematic from '@/assets/theme-previews/cinematic.jpg'
import themeEditorial from '@/assets/theme-previews/editorial.jpg'
import themeLuxury from '@/assets/theme-previews/luxury.jpg'
import themeCorporate from '@/assets/theme-previews/corporate.jpg'
import themePopArt from '@/assets/theme-previews/pop-art.jpg'
import themeVintage from '@/assets/theme-previews/vintage.jpg'
import themeNeon from '@/assets/theme-previews/neon.jpg'
import themeEarthy from '@/assets/theme-previews/earthy.jpg'
import themeBlackWhite from '@/assets/theme-previews/black-white.jpg'
import themeMetallic from '@/assets/theme-previews/metallic.jpg'
import themeGlassmorphism from '@/assets/theme-previews/glassmorphism.jpg'
import themePastel from '@/assets/theme-previews/pastel.jpg'
import themeIndustrialGrunge from '@/assets/theme-previews/industrial-grunge.jpg'
import themeGoldenHour from '@/assets/theme-previews/golden-hour.jpg'
import themeStudioGradient from '@/assets/theme-previews/studio-gradient.jpg'
import themeNatureFresh from '@/assets/theme-previews/nature-fresh.jpg'
import themeTechFuturistic from '@/assets/theme-previews/tech-futuristic.jpg'
import themeBoldTypographic from '@/assets/theme-previews/bold-typographic.jpg'
import themeWarmMinimal from '@/assets/theme-previews/warm-minimal.jpg'
import themeDramaticSpotlight from '@/assets/theme-previews/dramatic-spotlight.jpg'

type ThemeOption = { id: string; faLabel: string; enLabel: string; descriptor: string; image: string }

const THEME_OPTIONS: ThemeOption[] = [
  { id: 'minimalist', faLabel: 'مینیمال', enLabel: 'Minimalist Studio', descriptor: 'minimalist studio style, clean seamless background, lots of negative space, soft even studio lighting, premium product look', image: themeMinimalist },
  { id: 'dark-moody', faLabel: 'تاریک و مرموز', enLabel: 'Dark & Moody', descriptor: 'dark moody atmosphere, dramatic low-key lighting, deep shadows, single rim light, luxurious mysterious mood', image: themeDarkMoody },
  { id: 'cinematic', faLabel: 'سینمایی و فیلم', enLabel: 'Cinematic', descriptor: 'cinematic film look, anamorphic widescreen feel, dramatic teal and orange color grading, atmospheric haze, film-still quality', image: themeCinematic },
  { id: 'editorial', faLabel: 'مجله‌ای', enLabel: 'Editorial / Magazine', descriptor: 'magazine editorial layout, refined high-fashion photography, elegant composition, premium glossy print look', image: themeEditorial },
  { id: 'luxury', faLabel: 'لاکچری و پریمیوم', enLabel: 'Luxury / Premium', descriptor: 'luxury premium aesthetic, gold accents, marble surfaces, soft glamorous lighting, opulent high-end look', image: themeLuxury },
  { id: 'corporate', faLabel: 'شرکتی و تجاری', enLabel: 'Corporate Clean', descriptor: 'corporate clean style, bright crisp professional commercial lighting, polished modern business aesthetic', image: themeCorporate },
  { id: 'pop-art', faLabel: 'پاپ‌آرت', enLabel: 'Vibrant Pop', descriptor: 'vibrant pop-art style, bold saturated colors, high contrast, playful energetic backdrop, punchy advertising look', image: themePopArt },
  { id: 'vintage', faLabel: 'وینتیج و نوستالژیک', enLabel: 'Vintage / Retro', descriptor: 'vintage retro aesthetic, faded warm film tones, nostalgic grain, muted amber palette', image: themeVintage },
  { id: 'neon', faLabel: 'نئونی', enLabel: 'Neon / Cyberpunk', descriptor: 'neon cyberpunk style, vibrant neon glow, pink and cyan luminous accents, dark futuristic background, reflective wet surface', image: themeNeon },
  { id: 'earthy', faLabel: 'طبیعت و ارگانیک', enLabel: 'Earthy / Organic', descriptor: 'earthy organic style, natural stone and linen, dried botanicals, warm natural light, sustainable aesthetic', image: themeEarthy },
  { id: 'black-white', faLabel: 'سیاه و سفید', enLabel: 'Monochrome (B&W)', descriptor: 'black and white, high-contrast grayscale, dramatic monochrome studio lighting, fine art photography', image: themeBlackWhite },
  { id: 'metallic', faLabel: 'متالیک و براق', enLabel: 'Metallic / Chrome', descriptor: 'metallic chrome finish, glossy reflective silver surfaces, studio reflections, sleek futuristic premium look', image: themeMetallic },
  { id: 'glassmorphism', faLabel: 'گلس‌مورفیسم', enLabel: 'Glassmorphism', descriptor: 'glassmorphism style, frosted translucent glass, soft blur, light refractions, pastel gradient background, clean modern look', image: themeGlassmorphism },
  { id: 'pastel', faLabel: 'پاستلی', enLabel: 'Pastel Soft', descriptor: 'soft pastel palette, gentle muted blush pink, lilac and sky blue tones, airy dreamy diffused light', image: themePastel },
  { id: 'industrial-grunge', faLabel: 'صنعتی و گرانج', enLabel: 'Industrial Grunge', descriptor: 'raw industrial grunge style, exposed concrete and steel, pipes and machinery, gritty workshop, hard directional light, moody utilitarian mood', image: themeIndustrialGrunge },
  { id: 'golden-hour', faLabel: 'نور طلایی غروب', enLabel: 'Golden Hour', descriptor: 'golden hour aesthetic, warm sunset glow, long soft shadows, backlit rim light, cinematic warmth and amber tones', image: themeGoldenHour },
  { id: 'studio-gradient', faLabel: 'گرادیان استودیویی', enLabel: 'Studio Gradient', descriptor: 'smooth colored gradient studio backdrop, soft spotlight, vibrant modern commercial pop, clean product staging', image: themeStudioGradient },
  { id: 'nature-fresh', faLabel: 'طبیعت تازه', enLabel: 'Nature Fresh', descriptor: 'fresh nature style, lush green foliage, water droplets, dewy daylight, clean organic freshness', image: themeNatureFresh },
  { id: 'tech-futuristic', faLabel: 'تکنولوژی و آینده‌نگر', enLabel: 'Tech / Futuristic', descriptor: 'futuristic high-tech style, holographic UI accents, dark glass surfaces, blue luminous glow, sleek sci-fi product feel', image: themeTechFuturistic },
  { id: 'bold-typographic', faLabel: 'گرافیک تایپوگرافی', enLabel: 'Bold Typographic', descriptor: 'bold typographic poster style, strong geometric color blocks, Swiss Bauhaus layout, flat vivid shapes, punchy advertising energy', image: themeBoldTypographic },
  { id: 'warm-minimal', faLabel: 'مینیمال گرم', enLabel: 'Warm Minimal', descriptor: 'warm minimal style, beige and sand tones, soft natural shadows, cozy minimalist studio composition', image: themeWarmMinimal },
  { id: 'dramatic-spotlight', faLabel: 'نورپردازی نمایشی', enLabel: 'Dramatic Spotlight', descriptor: 'dramatic spotlight style, single hard spotlight, deep black background, theatrical product reveal, strong contrast', image: themeDramaticSpotlight },
]


const USER_IMAGES_BUCKET = 'user-images'

// Strips trailing identifier codes/numbers from a product name so they are not
// baked onto generated images, e.g. "wire_mesh 002" -> "wire mesh",
// "Rebar Stirrup 008" -> "Rebar Stirrup", "Product #12" -> "Product".
function stripProductCode(name: string): string {
  const cleaned = name
    .replace(/[\s_#-]*\d[\d\s_#-]*$/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/[\s#-]+$/g, '')
    .trim()
  return cleaned.length > 0 ? cleaned : name.trim()
}

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
  productsLoading?: boolean
  onProductsRefresh?: () => Promise<AiProductOption[] | unknown> | AiProductOption[] | unknown
  /** Playable URL of the current project's film opening clip, used to grab its first frame. */
  filmFrameSourceUrl?: string | null
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

/**
 * Loads a (same-origin / proxied) video URL into an offscreen element, seeks to
 * the first frame, and returns it as a PNG data URL. The URL must be CORS-safe
 * (via the video-proxy) or the canvas readback will throw a SecurityError.
 */
async function captureFirstFrame(url: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = url

    let settled = false
    const cleanup = () => {
      video.removeAttribute('src')
      try { video.load() } catch { /* ignore */ }
    }
    const fail = (msg: string) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(msg))
    }
    const timer = window.setTimeout(() => fail('Timed out reading the film frame.'), 15000)

    const grab = () => {
      if (settled) return
      try {
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) { fail('The film clip has no readable frame.'); return }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { fail('Could not create a drawing surface.'); return }
        ctx.drawImage(video, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/png')
        settled = true
        window.clearTimeout(timer)
        cleanup()
        resolve(dataUrl)
      } catch {
        fail("Couldn't read the film frame (the clip may not allow frame capture).")
      }
    }

    video.onloadeddata = () => {
      try {
        if (video.currentTime === 0) {
          // Nudge to force a decoded frame on browsers that won't paint t=0.
          video.currentTime = 0.001
        } else {
          video.currentTime = 0
        }
      } catch { grab() }
    }
    video.onseeked = grab
    video.onerror = () => fail('Could not load the film clip.')
  })
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

type CoverTextInspection = {
  hasText: boolean
  text: string
  language: string
  isAppropriate: boolean
  isAdSuitable: boolean
  reason: string
  suggestions: string[]
}

const GUARDIAN_LANGS: { code: string; label: string }[] = [
  { code: 'fa', label: 'Persian' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'Arabic' },
  { code: 'tr', label: 'Turkish' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ru', label: 'Russian' },
  { code: 'zh', label: 'Chinese' },
]

export default function AiImageDialog({
  open,

  onOpenChange,
  userId,
  defaultAspect,
  onSaved,
  products = [],
  productsLoading = false,
  onProductsRefresh,
  filmFrameSourceUrl = null,
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
  const [brokenProductIds, setBrokenProductIds] = useState<Set<string>>(new Set())
  const [isWritingPrompt, setIsWritingPrompt] = useState(false)
  const [isGrabbingFrame, setIsGrabbingFrame] = useState(false)

  // Guardian: inspects the on-image text (OCR), judges ad/cover suitability,
  // and can translate the extracted text without replacing the original.
  const [isInspecting, setIsInspecting] = useState(false)
  const [inspection, setInspection] = useState<CoverTextInspection | null>(null)
  const [inspectError, setInspectError] = useState<string | null>(null)
  const [translateLang, setTranslateLang] = useState('fa')
  const [translatedText, setTranslatedText] = useState<string | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)

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
      setProductMenuOpen(false)
      setBrokenProductIds(new Set())
      if (referenceInputRef.current) {
        referenceInputRef.current.value = ''
      }
      if (refineReferenceInputRef.current) {
        refineReferenceInputRef.current.value = ''
      }
    }
  }, [open, defaultAspect])

  useEffect(() => {
    setBrokenProductIds(new Set())
  }, [products.map((p) => `${p.id}:${p.url}`).join('|')])

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
      let currentProduct = product
      let res: Response | null = null
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          res = await fetch(currentProduct.url)
          if (res.ok) break
          throw new Error('Could not load the product image.')
        } catch (fetchErr) {
          if (attempt > 0 || !onProductsRefresh) throw fetchErr
          const refreshed = await onProductsRefresh()
          if (Array.isArray(refreshed)) {
            const fresh = refreshed.find((p) => p && typeof p === 'object' && 'id' in p && p.id === product.id) as AiProductOption | undefined
            if (fresh?.url) {
              currentProduct = { ...currentProduct, ...fresh }
              continue
            }
          }
          throw fetchErr
        }
      }
      if (!res?.ok) throw new Error('Could not load the product image.')
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
          : [...prev, { name: currentProduct.title || 'Product', dataUrl, isProduct: true }],
      )
      setProductMenuOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add product image.')
    } finally {
      setProductLoadingId(null)
    }
  }

  async function handleUseFilmFrame() {
    setError(null)
    if (!filmFrameSourceUrl) {
      setError('No film clip available yet. Add a clip to your project first.')
      return
    }
    if (referenceImages.length >= MAX_REFERENCE_IMAGES) {
      setError(`You can add up to ${MAX_REFERENCE_IMAGES} reference images.`)
      return
    }
    setIsGrabbingFrame(true)
    try {
      // Resolve through the same-origin video-proxy so the canvas is not tainted.
      const playUrl = await proxiedVideoUrl(filmFrameSourceUrl)
      const dataUrl = await captureFirstFrame(playUrl)
      setReferenceImages((prev) =>
        prev.length >= MAX_REFERENCE_IMAGES
          ? prev
          : [...prev, { name: 'Film first frame', dataUrl }],
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the film frame.")
    } finally {
      setIsGrabbingFrame(false)
    }
  }

  function handleProductMenuOpenChange(nextOpen: boolean) {
    setProductMenuOpen(nextOpen)
    if (nextOpen) {
      void onProductsRefresh?.()
    }
  }

  function handleProductThumbError(productId: string) {
    setBrokenProductIds((prev) => {
      if (prev.has(productId)) return prev
      const next = new Set(prev)
      next.add(productId)
      return next
    })
    void onProductsRefresh?.()
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
      const productRef = referenceImages.find((r) => r.isProduct)
      const { data, error: fnError } = await supabase.functions.invoke('write-image-prompt', {
        body: {
          referenceImages: referenceImages.map((r) => r.dataUrl),
          themeDescriptor: theme?.descriptor ?? '',
          themeLabel: theme?.enLabel ?? '',
          existingPrompt: prompt.trim(),
          includeAdCopy: Boolean(productRef),
          productName: stripProductCode(productRef?.name ?? ''),
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

  // Guardian: read on-image text + judge ad/cover suitability.
  async function handleInspectCover() {
    if (!imageDataUrl) return
    setInspectError(null)
    setInspection(null)
    setTranslatedText(null)
    setIsInspecting(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('inspect-cover-text', {
        body: { image: imageDataUrl },
      })
      if (fnError) {
        setInspectError(await extractFnError(fnError, 'Could not inspect the image. Try again.'))
        return
      }
      setInspection(data as CoverTextInspection)
    } catch (e) {
      setInspectError(e instanceof Error ? e.message : 'Could not inspect the image.')
    } finally {
      setIsInspecting(false)
    }
  }

  // Translate the extracted on-image text without replacing the original.
  async function handleTranslateCoverText() {
    const source = inspection?.text?.trim()
    if (!source) return
    setInspectError(null)
    setIsTranslating(true)
    setTranslatedText(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('translate-text', {
        body: { text: source, targetLang: translateLang },
      })
      if (fnError) {
        setInspectError(await extractFnError(fnError, 'Could not translate. Try again.'))
        return
      }
      const translated = typeof (data as { translation?: unknown })?.translation === 'string'
        ? (data as { translation: string }).translation.trim()
        : ''
      setTranslatedText(translated || '—')
    } catch (e) {
      setInspectError(e instanceof Error ? e.message : 'Could not translate.')
    } finally {
      setIsTranslating(false)
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
                    <div className="grid max-h-96 grid-cols-2 gap-3 overflow-y-auto pr-1">
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
                            className={`group relative block overflow-hidden rounded-xl border text-left transition ${
                              active
                                ? 'border-amber-300/80 ring-2 ring-amber-300/50'
                                : 'border-white/10 hover:border-white/30'
                            }`}
                          >
                            <span className="relative block aspect-[4/5] w-full overflow-hidden">
                              <img
                                src={t.image}
                                alt={t.enLabel}
                                loading="lazy"
                                width={512}
                                height={640}
                                className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                              />
                              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                              {active ? (
                                <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-black shadow">
                                  <Check className="h-3.5 w-3.5" />
                                </span>
                              ) : null}
                              <span
                                className={`absolute inset-x-0 bottom-0 truncate px-2.5 pb-2 pt-6 text-xs font-semibold tracking-tight ${
                                  active ? 'text-amber-100' : 'text-white'
                                }`}
                              >
                                {t.enLabel}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>

                  </PopoverContent>
                </Popover>
                <Popover open={productMenuOpen} onOpenChange={handleProductMenuOpenChange}>
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
                    {productsLoading && products.length === 0 ? (
                      <div className="flex items-center justify-center py-6 text-zinc-500">
                        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                      </div>
                    ) : products.length === 0 ? (
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
                                {brokenProductIds.has(p.id) ? (
                                  <span className="absolute inset-0 grid place-items-center bg-black/30 text-zinc-500">
                                    <Package className="h-5 w-5" aria-hidden="true" />
                                  </span>
                                ) : (
                                  <img
                                    src={p.url}
                                    alt={p.title ?? 'Product'}
                                    className="absolute inset-0 h-full w-full object-cover"
                                    onError={() => handleProductThumbError(p.id)}
                                  />
                                )}
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
                  onClick={() => void handleUseFilmFrame()}
                  disabled={isLoading || isGrabbingFrame || !filmFrameSourceUrl || referenceImages.length >= MAX_REFERENCE_IMAGES}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  title={filmFrameSourceUrl ? "Use the first frame of your film as a reference" : "No film clip available yet"}
                >
                  {isGrabbingFrame ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Clapperboard className="h-4 w-4" />
                  )}
                  <span>{isGrabbingFrame ? 'Reading…' : 'Use film frame'}</span>
                </button>
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleInspectCover()}
                  disabled={!imageDataUrl || isLoading || isSaving || isInspecting}
                  title="Guardian: read the on-image text, translate it, and check it is appropriate for a cover"
                >
                  {isInspecting ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  )}
                  {isInspecting ? 'Checking…' : 'Guardian'}
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
