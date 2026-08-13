import { useEffect, useRef, useState } from 'react'
import {
  Clapperboard,
  LoaderCircle,
  RefreshCw,
  Wand2,
  Film,
  ArrowRight,
  ArrowLeft,
  Check,
  ImageIcon,
  Clock,
  Package,
  UserRound,
  Mic,
  MicOff,
  ZoomIn,
  X,
  MonitorPlay,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { safeMediaUrl } from '@/modules/generator-ui/lib/safeMediaUrl'
import { canApproveFilm, isCharacterSheet, loadCharacterRows, sanitizeProductName, type FilmDuration, type FilmAspect } from '@/modules/generator-ui/lib/makeFilmWizard'
import { supabase } from '@/integrations/supabase/client'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export type { FilmDuration, FilmAspect } from '@/modules/generator-ui/lib/makeFilmWizard'
// Must stay a subset of DashboardPage's `Ratio` ('9:16' | '1:1' | '16:9') —
// that is what ai-image-generate and submitScenesAsJobs accept. 4:3 is
// deliberately absent: offering it here produced an aspect the render
// pipeline cannot honour.

const DURATIONS: FilmDuration[] = [5, 10, 15, 30, 45, 60, 90, 135]
const ASPECTS: { value: FilmAspect; label: string; dims: string }[] = [
  { value: '16:9', label: 'Landscape (16:9)', dims: '1920×1080' },
  { value: '9:16', label: 'Portrait/Story (9:16)', dims: '1080×1920' },
  { value: '1:1', label: 'Square (1:1)', dims: '1080×1080' },
]

const CAMERA_ANGLES: { value: string; label: string; prompt: string; imageUrl: string }[] = [
  { value: 'auto', label: 'Auto (AI decides)', prompt: '', imageUrl: '/placeholder.svg' },
  { value: 'close-up', label: 'Close-up', prompt: 'Close-up shot, intimate framing, focus on subject details.', imageUrl: 'https://images.unsplash.com/photo-1554048612-387768052bf7?w=120&h=80&fit=crop&q=80' },
  { value: 'medium-shot', label: 'Medium shot', prompt: 'Medium shot, waist-up framing, balanced composition.', imageUrl: 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=120&h=80&fit=crop&q=80' },
  { value: 'wide-shot', label: 'Wide shot', prompt: 'Wide shot, full body or environment visible, establishing composition.', imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=120&h=80&fit=crop&q=80' },
  { value: 'low-angle', label: 'Low angle', prompt: 'Low angle shot, looking up at subject, dramatic perspective.', imageUrl: 'https://images.unsplash.com/photo-1469334031218-e382a71b4f77?w=120&h=80&fit=crop&q=80' },
  { value: 'high-angle', label: 'High angle', prompt: 'High angle shot, looking down at subject, overview perspective.', imageUrl: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=120&h=80&fit=crop&q=80' },
  { value: 'side-angle', label: 'Side angle', prompt: 'Side profile angle, dramatic lighting from the side.', imageUrl: 'https://images.unsplash.com/photo-1542206395-9feb3a2f9e7c?w=120&h=80&fit=crop&q=80' },
  { value: 'over-shoulder', label: 'Over the shoulder', prompt: 'Over-the-shoulder shot, perspective from behind subject.', imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=80&fit=crop&q=80' },
]

const THEMES: { value: string; label: string; prompt: string; imageUrl: string }[] = [
  { value: 'auto', label: 'Auto (AI decides)', prompt: '', imageUrl: '/placeholder.svg' },
  { value: 'cinematic', label: 'Cinematic', prompt: 'Cinematic film look, dramatic lighting, shallow depth of field, color graded.', imageUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=120&h=80&fit=crop&q=80' },
  { value: 'bright', label: 'Bright & Clean', prompt: 'Bright, clean, well-lit, professional studio lighting, white background feel.', imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=120&h=80&fit=crop&q=80' },
  { value: 'dark', label: 'Dark & Moody', prompt: 'Dark, moody, low-key lighting, shadows, atmospheric, noir feel.', imageUrl: 'https://images.unsplash.com/photo-1514306191717-452ec28c0404?w=120&h=80&fit=crop&q=80' },
  { value: 'vibrant', label: 'Vibrant & Colorful', prompt: 'Vibrant, saturated colors, energetic, lively, pop art feel.', imageUrl: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=120&h=80&fit=crop&q=80' },
  { value: 'minimal', label: 'Minimal', prompt: 'Minimal, clean lines, simple composition, lots of negative space, elegant.', imageUrl: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?w=120&h=80&fit=crop&q=80' },
  { value: 'retro', label: 'Retro/Vintage', prompt: 'Retro vintage film look, grain, warm tones, old school aesthetic.', imageUrl: 'https://images.unsplash.com/photo-1461360370896-922624d12aad?w=120&h=80&fit=crop&q=80' },
  { value: 'futuristic', label: 'Futuristic', prompt: 'Futuristic, neon lights, cyberpunk, high-tech, sleek modern aesthetic.', imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=120&h=80&fit=crop&q=80' },
]

const PRODUCTS_BUCKET = 'user-images'
const FRAMES_BUCKET = 'wan-frames'

function storageObjectKey(storagePath: string | null | undefined, bucket: string): string | null {
  if (!storagePath) return null
  const marker = `/${bucket}/`
  const idx = storagePath.indexOf(marker)
  if (idx >= 0) {
    const tail = storagePath.slice(idx + marker.length).split('?')[0]
    return decodeURIComponent(tail)
  }
  if (!/^https?:\/\/|^blob:|^data:/.test(storagePath)) return storagePath
  return null
}

async function signStorageUrl(storagePath: string | null | undefined, bucket: string): Promise<string> {
  const raw = storagePath ?? ''
  if (/^blob:|^data:/.test(raw)) return raw
  if (/\/object\/sign\//.test(raw)) return raw
  const key = storageObjectKey(raw, bucket)
  if (!key) return raw
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(key, 60 * 60 * 24 * 7)
    if (!error && data?.signedUrl) return data.signedUrl
  } catch {
    /* fall through */
  }
  return raw
}

type ProductPhoto = { id: string; title: string | null; url: string; imageType?: string | null }

type WizardStep = 'prompt' | 'scenario' | 'images'

export interface FilmIdentity {
  productUrl?: string
  productName?: string | null
  productDescription?: string | null
  characterUrl?: string
  characterName?: string | null
}

// A single reference identity frozen at selection time. Carries the URL, the
// role, the explicit image type, the character-sheet flag, and the display name
// together so that initial generation, Regenerate, and Approve all consume the
// SAME identity without re-deriving it from the (possibly changed) Step 1
// selection.
export interface IdentityRef {
  url: string
  role: 'product' | 'character'
  imageType?: string | null
  characterSheet: boolean
  name?: string | null
}

// Immutable snapshot of the product/character selection, frozen when image
// generation starts. Both initial generation and Regenerate consume this
// snapshot so a later change to the Step 1 selection cannot silently change
// the identities used for the already-started film.
export interface IdentitySnapshot {
  product?: IdentityRef
  character?: IdentityRef
}

export interface FilmCreative {
  cameraStyle?: string
  cameraLabel?: string
  theme?: string
  themeLabel?: string
}

export interface MakeFilmWizardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPrompt: string
  defaultDuration: FilmDuration
  defaultAspect: FilmAspect
  userId: string | null
  writeScenario: (prompt: string, options?: { duration?: number; productUrl?: string; characterUrl?: string; withNarration?: boolean; aspect?: FilmAspect; productName?: string | null; characterName?: string | null; cameraStyle?: string; theme?: string }) => Promise<string[]>
  generateSceneImage: (sceneText: string, aspect?: FilmAspect, productUrl?: string, characterUrl?: string, noText?: boolean, creative?: FilmCreative, characterSheet?: boolean) => Promise<string>
  onApprove: (scenes: string[], perSceneImageUrls: (string | undefined)[], options?: { duration?: number; aspect?: FilmAspect; withNarration?: boolean; identity?: FilmIdentity; creative?: FilmCreative }) => void
}

export function MakeFilmWizardDialog({
  open,
  onOpenChange,
  initialPrompt,
  defaultDuration,
  defaultAspect,
  userId,
  writeScenario,
  generateSceneImage,
  onApprove,
}: MakeFilmWizardDialogProps) {
  const [step, setStep] = useState<WizardStep>('prompt')
  const [prompt, setPrompt] = useState('')
  const [scenes, setScenes] = useState<string[]>([])
  const [images, setImages] = useState<(string | undefined)[]>([])
  const [imageErrors, setImageErrors] = useState<(string | undefined)[]>([])
  const [busy, setBusy] = useState<'idle' | 'scenario' | 'images'>('idle')
  const [regenIndex, setRegenIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Prompt optimization (enhance-prompt edge function).
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeError, setOptimizeError] = useState<string | null>(null)
  // Snapshot of the prompt before optimization so the user can undo the rewrite.
  const [promptBeforeOptimize, setPromptBeforeOptimize] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [duration, setDuration] = useState<FilmDuration>(defaultDuration)
  const [aspect, setAspect] = useState<FilmAspect>(defaultAspect)
  const [withNarration, setWithNarration] = useState(true)
  const [noTextOnImages, setNoTextOnImages] = useState(true)
  const [selectedCameraAngle, setSelectedCameraAngle] = useState('auto')
  const [selectedTheme, setSelectedTheme] = useState('auto')
  const [productPhotos, setProductPhotos] = useState<ProductPhoto[]>([])
  const [characterPhotos, setCharacterPhotos] = useState<ProductPhoto[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ProductPhoto | null>(null)
  const [selectedCharacter, setSelectedCharacter] = useState<ProductPhoto | null>(null)
  // Immutable snapshot of the product/character selection, frozen when image
  // generation starts. Both initial generation and Regenerate consume this
  // snapshot so a later change to the Step 1 selection cannot silently change
  // the identities used for the already-started film.
  const [identitySnapshot, setIdentitySnapshot] = useState<IdentitySnapshot | null>(null)
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [loadingCharacters, setLoadingCharacters] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [lightboxScene, setLightboxScene] = useState<string>('')
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (open && !hasInitialized.current) {
      hasInitialized.current = true
      setStep('prompt')
      setPrompt(initialPrompt ?? '')
      setScenes([])
      setImages([])
      setImageErrors([])
      setBusy('idle')
      setRegenIndex(null)
      setError(null)
      setOptimizing(false)
      setOptimizeError(null)
      setPromptBeforeOptimize(null)
      setProgress(null)
      setDuration(defaultDuration)
      setAspect(defaultAspect)
      setWithNarration(true)
      setNoTextOnImages(true)
      setSelectedCameraAngle('auto')
      setSelectedTheme('auto')
      setSelectedProduct(null)
      setSelectedCharacter(null)
      setIdentitySnapshot(null)
      setProductPickerOpen(false)
      setCharacterPickerOpen(false)
      setLightboxOpen(false)
    }
    if (!open) {
      hasInitialized.current = false
    }
  }, [open, initialPrompt, defaultDuration, defaultAspect])

  const working = busy !== 'idle' || regenIndex !== null

  async function loadProductPhotos() {
    if (!userId) {
      setError('Please sign in to choose a product.')
      return
    }
    setLoadingProducts(true)
    setError(null)
    try {
      const { data, error: qErr } = await supabase
        .from('generator_user_images')
        .select('id, storage_path, title')
        .eq('category', 'product')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (qErr) throw new Error(qErr.message)
      const rows = (data ?? []).filter((r) => !r.title?.toLowerCase().includes('character'))
      const photos: ProductPhoto[] = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          title: r.title ?? null,
          url: await signStorageUrl(r.storage_path, PRODUCTS_BUCKET),
        })),
      )
      setProductPhotos(photos)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load products')
    } finally {
      setLoadingProducts(false)
    }
  }

  async function loadCharacterPhotos() {
    if (!userId) {
      setError('Please sign in to choose a character.')
      return
    }
    setLoadingCharacters(true)
    setError(null)
    try {
      const { rows, fellBack } = await loadCharacterRows((columns) =>
        supabase
          .from('generator_user_images')
          .select(columns)
          .eq('user_id', userId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      )
      const filtered = rows.filter((r) => (r.category ?? 'general') === 'character')
      const photos: ProductPhoto[] = await Promise.all(
        filtered.map(async (r) => ({
          id: r.id,
          title: r.title,
          url: await signStorageUrl(r.storage_path, PRODUCTS_BUCKET),
          imageType: r.imageType,
        })),
      )
      setCharacterPhotos(photos)
      // fellBack is intentionally unused here: the legacy rows carry
      // imageType=null and the existing isCharacterSheet heuristic classifies
      // them. Keeping the variable named documents the fallback path.
      void fellBack
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load characters')
    } finally {
      setLoadingCharacters(false)
    }
  }

  function pickProduct(photo: ProductPhoto) {
    setSelectedProduct(photo)
    setProductPickerOpen(false)
  }

  function pickCharacter(photo: ProductPhoto) {
    setSelectedCharacter(photo)
    setCharacterPickerOpen(false)
  }

  // A character reference is a multi-view character sheet when it was produced
  // by generate-character-sheet or explicitly marked by the user on upload.
  // The authoritative source is the persistent image_type metadata; the
  // title/URL heuristic is only a backward-compatible fallback for legacy rows
  // written before image_type existed.
  function isCharacterSheetRef(photo: ProductPhoto | null): boolean {
    return isCharacterSheet(photo?.imageType, photo?.title, photo?.url)
  }

  // Build a structured identity ref from a selected photo, or undefined when
  // nothing is selected. Used to freeze the selection into the snapshot.
  function toIdentityRef(photo: ProductPhoto | null, role: 'product' | 'character'): IdentityRef | undefined {
    if (!photo) return undefined
    return {
      url: photo.url,
      role,
      imageType: photo.imageType ?? null,
      characterSheet: role === 'character' && isCharacterSheetRef(photo),
      // Sanitize the display name so auto-generated upload/version suffixes
      // (e.g. "stirup001") never leak into the scenario, narration or clip
      // prompts. The raw database title is left untouched.
      name: role === 'product' ? sanitizeProductName(photo.title) : photo.title ?? null,
    }
  }

  function generateDurationPrompt(basePrompt: string, durationSeconds: number): string {
    const sceneCount = Math.ceil(durationSeconds / 15)
    const sceneDuration = Math.floor(durationSeconds / sceneCount)
    
    return `${basePrompt}

IMPORTANT: Create exactly ${sceneCount} scenes, each approximately ${sceneDuration} seconds long. Total film duration must be ${durationSeconds} seconds.
Each scene should flow logically into the next, building toward a single cohesive narrative. All scenes must serve the same overall story goal.`
  }

  async function handleWriteScenario() {
    const idea = prompt.trim()
    if (!idea) {
      setError('Type a prompt first so I can write the film.')
      return
    }
    setBusy('scenario')
    setError(null)
    setProgress('Writing your film scenario…')
    try {
      let enrichedPrompt = generateDurationPrompt(idea, duration)
      // Sanitize the product name so auto-generated upload/version suffixes
      // (e.g. "stirup001") never leak into the scenario or narration text.
      const productName = selectedProduct ? sanitizeProductName(selectedProduct.title) : null
      if (selectedProduct && selectedCharacter) {
        enrichedPrompt += `\n\nPRODUCT AND CHARACTER TO FEATURE TOGETHER: The product "${productName || 'Selected Product'}" (image: ${selectedProduct.url}) AND the character "${selectedCharacter.title || 'Selected Character'}" (image: ${selectedCharacter.url}) MUST BOTH appear together prominently in every scene of the film. Show the character interacting with or holding the product.`
      } else if (selectedProduct) {
        enrichedPrompt += `\n\nPRODUCT TO FEATURE: ${productName || 'Selected Product'}. The product image URL is: ${selectedProduct.url}. This product MUST appear prominently in every scene of the film.`
      } else if (selectedCharacter) {
        enrichedPrompt += `\n\nCHARACTER TO FEATURE: ${selectedCharacter.title || 'Selected Character'}. The character image URL is: ${selectedCharacter.url}. This character MUST appear prominently in every scene of the film.`
      }
      
      // Add camera angle directive
      const cameraAngle = CAMERA_ANGLES.find((a) => a.value === selectedCameraAngle)
      if (cameraAngle && cameraAngle.prompt) {
        enrichedPrompt += `\n\nCAMERA ANGLE: ${cameraAngle.prompt}`
      }
      
      // Add visual theme directive
      const theme = THEMES.find((t) => t.value === selectedTheme)
      if (theme && theme.prompt) {
        enrichedPrompt += `\n\nVISUAL STYLE: ${theme.prompt}`
      }
      const written = await writeScenario(enrichedPrompt, {
        duration,
        productUrl: selectedProduct?.url,
        characterUrl: selectedCharacter?.url,
        productName,
        characterName: selectedCharacter?.title ?? null,
        withNarration,
        aspect,
        cameraStyle: cameraAngle?.prompt,
        theme: theme?.prompt,
      })
      const cleaned = written.map((s) => s.trim()).filter((s) => s.length > 0)
      if (cleaned.length === 0) {
        setError('The scenario came back empty — try rephrasing your prompt.')
        return
      }
      setScenes(cleaned)
      setImages(new Array(cleaned.length).fill(undefined))
      setStep('scenario')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write the scenario.')
    } finally {
      setBusy('idle')
      setProgress(null)
    }
  }

  // Optimize the user's prompt via the enhance-prompt edge function. The
  // rewrite preserves the original language, goal, constraints and details
  // while making the text clearer and more suitable for image generation.
  // The original text is kept so the user can undo the rewrite.
  async function handleOptimizePrompt() {
    const current = prompt.trim()
    if (!current) return
    if (optimizing) return
    setOptimizing(true)
    setOptimizeError(null)
    setPromptBeforeOptimize(prompt)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('enhance-prompt', {
        body: { prompt: current },
      })
      if (fnError) throw fnError
      const enhanced = (data as { enhancedPrompt?: string } | null)?.enhancedPrompt?.trim()
      if (!enhanced) {
        throw new Error('The AI returned an empty prompt — your original text was kept.')
      }
      setPrompt(enhanced)
    } catch (err) {
      // Keep the original text on error and surface a readable message.
      setPromptBeforeOptimize(null)
      setOptimizeError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not optimize the prompt. Your original text was kept.',
      )
    } finally {
      setOptimizing(false)
    }
  }

  function handleUndoOptimize() {
    if (promptBeforeOptimize === null) return
    setPrompt(promptBeforeOptimize)
    setPromptBeforeOptimize(null)
    setOptimizeError(null)
  }

  function currentCreative(): FilmCreative {
    const cameraAngle = CAMERA_ANGLES.find((a) => a.value === selectedCameraAngle)
    const theme = THEMES.find((t) => t.value === selectedTheme)
    return {
      cameraStyle: cameraAngle?.prompt,
      cameraLabel: cameraAngle?.label,
      theme: theme?.prompt,
      themeLabel: theme?.label,
    }
  }

  async function handleGenerateImages() {
    if (scenes.length === 0) return
    setBusy('images')
    setError(null)
    // Freeze the product/character selection into an immutable snapshot so both
    // this initial generation and any later Regenerate use the SAME identities.
    // The snapshot carries url + role + characterSheet together, so nothing is
    // re-derived from the (possibly changed) Step 1 selection later.
    const snapshot: IdentitySnapshot = {
      product: toIdentityRef(selectedProduct, 'product'),
      character: toIdentityRef(selectedCharacter, 'character'),
    }
    setIdentitySnapshot(snapshot)
    const characterSheet = snapshot.character?.characterSheet ?? false
    const next: (string | undefined)[] = new Array(scenes.length).fill(undefined)
    const nextErrors: (string | undefined)[] = new Array(scenes.length).fill(undefined)
    const creative = currentCreative()
    for (let i = 0; i < scenes.length; i++) {
      setProgress(`Designing preview image ${i + 1} of ${scenes.length}…`)
      try {
        next[i] = await generateSceneImage(scenes[i], aspect, snapshot.product?.url, snapshot.character?.url, noTextOnImages, creative, characterSheet)
        nextErrors[i] = undefined
      } catch (err) {
        console.error(`Make-film wizard: preview image ${i + 1} failed`, err)
        next[i] = undefined
        nextErrors[i] = err instanceof Error ? err.message : `Could not generate image ${i + 1}.`
      }
      setImages([...next])
      setImageErrors([...nextErrors])
    }
    setBusy('idle')
    setProgress(null)
    setStep('images')
  }

  async function handleRegenerate(index: number) {
    if (working) return
    setRegenIndex(index)
    setError(null)
    try {
      // Consume the frozen snapshot (same identities as the initial generation).
      // The characterSheet flag comes from the snapshot, NOT from the current
      // Step 1 selection, so a later selection change cannot flip the sheet flag
      // used for Regenerate.
      const snapshot = identitySnapshot ?? {
        product: toIdentityRef(selectedProduct, 'product'),
        character: toIdentityRef(selectedCharacter, 'character'),
      }
      const characterSheet = snapshot.character?.characterSheet ?? false
      const url = await generateSceneImage(scenes[index], aspect, snapshot.product?.url, snapshot.character?.url, noTextOnImages, currentCreative(), characterSheet)
      setImages((cur) => {
        const copy = [...cur]
        copy[index] = url
        return copy
      })
      setImageErrors((cur) => {
        const copy = [...cur]
        copy[index] = undefined
        return copy
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Could not regenerate image ${index + 1}.`
      setImageErrors((cur) => {
        const copy = [...cur]
        copy[index] = msg
        return copy
      })
      setError(msg)
    } finally {
      setRegenIndex(null)
    }
  }

  function openLightbox(url: string, sceneText: string) {
    setLightboxImage(url)
    setLightboxScene(sceneText)
    setLightboxOpen(true)
  }

  function handleApprove() {
    try {
      onApprove(scenes, images, {
        duration,
        aspect,
        withNarration,
        identity: {
          // Approve consumes the frozen snapshot so the rendered film uses the
          // SAME identities (url, name, type) that were previewed, even if the
          // Step 1 selection changed after generation started.
          productUrl: (identitySnapshot?.product ?? toIdentityRef(selectedProduct, 'product'))?.url,
          productName: (identitySnapshot?.product ?? toIdentityRef(selectedProduct, 'product'))?.name ?? null,
          characterUrl: (identitySnapshot?.character ?? toIdentityRef(selectedCharacter, 'character'))?.url,
          characterName: (identitySnapshot?.character ?? toIdentityRef(selectedCharacter, 'character'))?.name ?? null,
        },
        creative: currentCreative(),
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start film render.')
    }
  }

  const stepIndex = step === 'prompt' ? 1 : step === 'scenario' ? 2 : 3
  const stepLabel =
    step === 'prompt' ? 'Prompt' :
    step === 'scenario' ? 'Scenario' :
    'Preview images'

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => (working ? undefined : onOpenChange(v))}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-full h-full border-white/10 bg-zinc-950/95 text-zinc-100 flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-zinc-100 text-lg">
              <Clapperboard className="h-6 w-6 text-fuchsia-300" aria-hidden="true" />
              Make Full Film
            </DialogTitle>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-sm font-semibold tracking-wide text-fuchsia-300">
                Step {stepIndex} of 3
              </span>
              <span className="text-base font-semibold text-zinc-100">{stepLabel}</span>
            </div>
            <DialogDescription className="text-sm text-zinc-400">
              Review the scenario and one preview image per scene. Nothing renders until you approve.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto pr-1 min-h-0">
            {/* Step 1 — write / edit the prompt + options. */}
            {step === 'prompt' && (
              <div className="space-y-4">
                {/* Duration selector */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <Clock className="h-3.5 w-3.5" />
                    Film duration
                  </label>
                  <Select
                    value={String(duration)}
                    onValueChange={(v) => setDuration(Number(v) as FilmDuration)}
                  >
                    <SelectTrigger className="w-[140px] border-white/10 bg-white/[0.03] text-xs text-zinc-100">
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-zinc-900 text-zinc-100">
                      {DURATIONS.map((d) => (
                        <SelectItem key={d} value={String(d)} className="text-xs">
                          {d}s
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-zinc-500">
                    {Math.ceil(duration / 15)} scenes × ~{Math.floor(duration / Math.ceil(duration / 15))}s each
                  </p>
                </div>

                {/* Aspect ratio selector */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <MonitorPlay className="h-3.5 w-3.5" />
                    Aspect ratio
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {ASPECTS.map((a) => (
                      <Button
                        key={a.value}
                        type="button"
                        variant={aspect === a.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setAspect(a.value)}
                        className={`h-8 gap-1 text-xs ${aspect === a.value ? 'bg-fuchsia-500/90 text-white hover:bg-fuchsia-500' : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'}`}
                      >
                        {a.label}
                        <span className="text-[10px] opacity-60">({a.dims})</span>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Product selector */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <Package className="h-3.5 w-3.5" />
                    Product for ad
                  </label>
                  <div className="flex items-center gap-2">
                    {selectedProduct ? (
                      <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5">
                        <img src={selectedProduct.url} alt="Product" className="h-8 w-8 rounded object-cover" />
                        <span className="text-xs text-zinc-300">{selectedProduct ? sanitizeProductName(selectedProduct.title) : 'Product'}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedProduct(null)}
                          className="ml-1 rounded p-0.5 text-zinc-500 hover:text-zinc-300"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { setProductPickerOpen(true); loadProductPhotos() }}
                        className="h-8 gap-1 border-white/10 bg-white/[0.03] text-xs text-zinc-300 hover:bg-white/[0.06]"
                      >
                        <Package className="h-3.5 w-3.5" />
                        Choose product
                      </Button>
                    )}
                  </div>
                </div>

                {/* Character selector */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <UserRound className="h-3.5 w-3.5" />
                    Character
                  </label>
                  <div className="flex items-center gap-2">
                    {selectedCharacter ? (
                      <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5">
                        <img src={selectedCharacter.url} alt="Character" className="h-8 w-8 rounded object-cover" />
                        <span className="text-xs text-zinc-300">{selectedCharacter.title ?? 'Character'}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedCharacter(null)}
                          className="ml-1 rounded p-0.5 text-zinc-500 hover:text-zinc-300"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { setCharacterPickerOpen(true); loadCharacterPhotos() }}
                        className="h-8 gap-1 border-white/10 bg-white/[0.03] text-xs text-zinc-300 hover:bg-white/[0.06]"
                      >
                        <UserRound className="h-3.5 w-3.5" />
                        Choose character
                      </Button>
                    )}
                  </div>
                </div>

                {/* Narration toggle */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <Mic className="h-3.5 w-3.5" />
                    Narration
                  </label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={withNarration ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setWithNarration(true)}
                      className={`h-8 gap-1 text-xs ${withNarration ? 'bg-fuchsia-500/90 text-white hover:bg-fuchsia-500' : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'}`}
                    >
                      <Mic className="h-3.5 w-3.5" />
                      With narration
                    </Button>
                    <Button
                      type="button"
                      variant={!withNarration ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setWithNarration(false)}
                      className={`h-8 gap-1 text-xs ${!withNarration ? 'bg-fuchsia-500/90 text-white hover:bg-fuchsia-500' : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'}`}
                    >
                      <MicOff className="h-3.5 w-3.5" />
                      Without narration
                    </Button>
                  </div>
                </div>

                {/* No text on images toggle */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Text on images
                  </label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={noTextOnImages ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setNoTextOnImages(true)}
                      className={`h-8 gap-1 text-xs ${noTextOnImages ? 'bg-emerald-500/90 text-white hover:bg-emerald-500' : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'}`}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Clean images (no text)
                    </Button>
                    <Button
                      type="button"
                      variant={!noTextOnImages ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setNoTextOnImages(false)}
                      className={`h-8 gap-1 text-xs ${!noTextOnImages ? 'bg-emerald-500/90 text-white hover:bg-emerald-500' : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'}`}
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      With text overlays
                    </Button>
                  </div>
                </div>

                {/* Camera angle selector */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <ZoomIn className="h-3.5 w-3.5" />
                    Camera angle
                  </label>
                  <Select value={selectedCameraAngle} onValueChange={(v) => setSelectedCameraAngle(v)}>
                    <SelectTrigger className="w-full border-white/10 bg-white/[0.03] text-xs text-zinc-100">
                      <SelectValue placeholder="Select camera angle" />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-zinc-900 text-zinc-100">
                      {CAMERA_ANGLES.map((a) => (
                        <SelectItem key={a.value} value={a.value} className="text-xs">
                          <div className="flex items-center gap-2">
                            {a.imageUrl && a.imageUrl !== '/placeholder.svg' && (
                              <img src={a.imageUrl} alt={a.label} className="h-8 w-12 rounded object-cover" />
                            )}
                            <span>{a.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Theme selector */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <Clapperboard className="h-3.5 w-3.5" />
                    Visual theme
                  </label>
                  <Select value={selectedTheme} onValueChange={(v) => setSelectedTheme(v)}>
                    <SelectTrigger className="w-full border-white/10 bg-white/[0.03] text-xs text-zinc-100">
                      <SelectValue placeholder="Select visual theme" />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-zinc-900 text-zinc-100">
                      {THEMES.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="text-xs">
                          <div className="flex items-center gap-2">
                            {t.imageUrl && t.imageUrl !== '/placeholder.svg' && (
                              <img src={t.imageUrl} alt={t.label} className="h-8 w-12 rounded object-cover" />
                            )}
                            <span>{t.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Prompt */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Your prompt
                  </label>
                  <div className="relative">
                    <Textarea
                      value={prompt}
                      onChange={(e) => {
                        setPrompt(e.target.value)
                        setOptimizeError(null)
                      }}
                      placeholder="Describe the film you want (any language)…"
                      rows={5}
                      className="resize-none border-white/10 bg-white/[0.03] pr-10 text-sm text-zinc-100"
                    />
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Optimize prompt"
                            aria-disabled={optimizing || prompt.trim().length === 0}
                            disabled={optimizing || prompt.trim().length === 0}
                            onClick={handleOptimizePrompt}
                            className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {optimizing ? (
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                              <Wand2 className="h-4 w-4" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {optimizing ? 'Optimizing prompt…' : 'Optimize prompt with AI'}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  {optimizeError && (
                    <p className="text-[11px] text-red-400">{optimizeError}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-zinc-500">
                      AI will auto-adjust scene count based on {duration}s duration.
                    </p>
                    {promptBeforeOptimize !== null && !optimizing && (
                      <button
                        type="button"
                        onClick={handleUndoOptimize}
                        className="text-[11px] font-medium text-fuchsia-300/90 hover:text-fuchsia-200"
                      >
                        Undo optimization
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 — review / edit the scenario. */}
            {step === 'scenario' && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-300">
                  Here is the scenario the AI wrote. Edit any scene, then generate one preview image per scene.
                </p>
                {scenes.map((scene, i) => (
                  <div key={i} className="space-y-1.5 rounded-md border border-white/10 bg-white/[0.02] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-300/90">
                      Scene {i + 1} (~{Math.floor(duration / scenes.length)}s)
                    </div>
                    <Textarea
                      value={scene}
                      onChange={(e) =>
                        setScenes((cur) => {
                          const copy = [...cur]
                          copy[i] = e.target.value
                          return copy
                        })
                      }
                      rows={3}
                      className="resize-none border-white/10 bg-white/[0.03] text-sm text-zinc-100"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Step 3 — review preview images with zoom. */}
            {step === 'images' && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-300">
                  One preview image per scene. Click to zoom. Regenerate any you dislike. Preview final film before approving.
                </p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {scenes.map((scene, i) => {
                    const url = safeMediaUrl(images[i])
                    const isRegen = regenIndex === i
                    const sceneError = imageErrors[i]
                    return (
                      <div key={i} className="space-y-2 rounded-md border border-white/10 bg-white/[0.02] p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-300/90">
                            Scene {i + 1}
                          </div>
                          <div className="flex items-center gap-1">
                            {url && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => openLightbox(url, scene)}
                                className="h-7 gap-1 px-2 text-xs text-zinc-300 hover:text-fuchsia-100"
                              >
                                <ZoomIn className="h-3.5 w-3.5" />
                                Zoom
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={working}
                              onClick={() => handleRegenerate(i)}
                              className="h-7 gap-1 px-2 text-xs text-zinc-300 hover:text-fuchsia-100"
                            >
                              {isRegen ? (
                                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              Regenerate
                            </Button>
                          </div>
                        </div>
                        <div 
                          className="grid place-items-center overflow-hidden rounded bg-black/40 cursor-pointer max-h-[240px]"
                          style={{ aspectRatio: aspect === '9:16' ? '9/16' : aspect === '16:9' ? '16/9' : '1/1' }}
                          onClick={() => url && openLightbox(url, scene)}
                        >
                          {isRegen ? (
                            <LoaderCircle className="h-6 w-6 animate-spin text-zinc-500" aria-hidden="true" />
                          ) : url ? (
                            <img src={url} alt={`Preview for scene ${i + 1}`} className="h-full w-full object-cover max-h-[240px]" />
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-zinc-600">
                              <ImageIcon className="h-6 w-6" aria-hidden="true" />
                              <span className="text-[11px]">No image — regenerate</span>
                            </div>
                          )}
                        </div>
                        {sceneError && (
                          <div className="rounded border border-red-400/30 bg-red-500/10 px-2 py-1 text-[11px] leading-4 text-red-200">
                            {sceneError}
                          </div>
                        )}
                        <p className="line-clamp-2 text-[11px] leading-4 text-zinc-500">{scene}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {progress && (
              <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                {progress}
              </div>
            )}
            {error && (
              <div className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            )}
          </div>

          {/* Footer navigation */}
          <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
            <div>
              {step === 'prompt' && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={working}
                  onClick={() => onOpenChange(false)}
                  className="gap-1 text-zinc-300 hover:text-zinc-100"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
              )}
              {step === 'scenario' && (
                <Button type="button" variant="ghost" disabled={working} onClick={() => setStep('prompt')} className="gap-1 text-zinc-300 hover:text-zinc-100">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
              )}
              {step === 'images' && (
                <Button type="button" variant="ghost" disabled={working} onClick={() => setStep('scenario')} className="gap-1 text-zinc-300 hover:text-zinc-100">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {step === 'prompt' && (
                <Button
                  type="button"
                  disabled={busy === 'scenario' || prompt.trim().length === 0}
                  onClick={handleWriteScenario}
                  className="gap-1.5 bg-fuchsia-500/90 text-white hover:bg-fuchsia-500"
                >
                  {busy === 'scenario' ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Wand2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  Write scenario
                </Button>
              )}
              {step === 'scenario' && (
                <Button
                  type="button"
                  disabled={busy === 'images'}
                  onClick={handleGenerateImages}
                  className="gap-1.5 bg-fuchsia-500/90 text-white hover:bg-fuchsia-500"
                >
                  {busy === 'images' ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ImageIcon className="h-4 w-4" aria-hidden="true" />
                  )}
                  Generate preview images
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
              {step === 'images' && (
                <Button
                  type="button"
                  disabled={working || !canApproveFilm(images)}
                  onClick={handleApprove}
                  className="gap-1.5 bg-emerald-500/90 text-white hover:bg-emerald-500"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Approve &amp; Make Film
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Picker Dialog */}
      <Dialog open={productPickerOpen} onOpenChange={setProductPickerOpen}>
        <DialogContent className="max-w-lg border-white/10 bg-zinc-950/95 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base">Choose a product</DialogTitle>
          </DialogHeader>
          {loadingProducts ? (
            <div className="flex items-center justify-center py-10 text-sm text-zinc-400">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Loading products…
            </div>
          ) : productPhotos.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-500">No saved product photos yet.</div>
          ) : (
            <div className="grid max-h-[50vh] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
              {productPhotos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => pickProduct(photo)}
                  className="group relative overflow-hidden rounded-md border border-white/10 bg-black/30 text-left transition hover:border-fuchsia-300/40"
                >
                  <img src={photo.url} alt={photo.title ?? 'Product'} loading="lazy" className="aspect-square w-full bg-black/40 object-cover" />
                  <div className="truncate px-2 py-1 text-[11px] text-zinc-200">{photo.title || 'Untitled'}</div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Character Picker Dialog */}
      <Dialog open={characterPickerOpen} onOpenChange={setCharacterPickerOpen}>
        <DialogContent className="max-w-lg border-white/10 bg-zinc-950/95 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base">Choose a character</DialogTitle>
          </DialogHeader>
          {loadingCharacters ? (
            <div className="flex items-center justify-center py-10 text-sm text-zinc-400">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Loading characters…
            </div>
          ) : characterPhotos.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-500">No characters yet. Create one with the Character Sheet.</div>
          ) : (
            <div className="grid max-h-[50vh] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
              {characterPhotos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => pickCharacter(photo)}
                  className="group relative overflow-hidden rounded-md border border-white/10 bg-black/30 text-left transition hover:border-amber-300/40"
                >
                  <img src={photo.url} alt={photo.title ?? 'Character'} loading="lazy" className="aspect-square w-full bg-black/40 object-cover" />
                  <div className="truncate px-2 py-1 text-[11px] text-zinc-200">{photo.title || 'Untitled'}</div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox for zoom */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl border-white/10 bg-zinc-950/95 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base">Preview</DialogTitle>
          </DialogHeader>
          {lightboxImage && (
            <div className="flex flex-col items-center gap-3">
              <img src={lightboxImage} alt="Preview" className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain" />
              <p className="text-sm text-zinc-400">{lightboxScene}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export default MakeFilmWizardDialog
