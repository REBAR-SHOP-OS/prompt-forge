import { useCallback, useEffect, useRef, useState } from 'react'
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
  Sparkles,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { safeMediaUrl } from '@/modules/generator-ui/lib/safeMediaUrl'

import { buildFilmPlans, type FilmPlan, expectedPlanCount, computePlanCredits } from '@/modules/generator-ui/lib/makeFilmWizard'
import { buildWizardCameraOptions, buildWizardThemeOptions, type WizardStyleOption } from '@/modules/generator-ui/lib/promptStyles'
import { supabase } from '@/integrations/supabase/client'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { StylePickerDialog } from './StylePickerDialog'
import CharacterSheetDialog, { type CharacterSheetSource } from './CharacterSheetDialog'

export type { FilmDuration, FilmAspect } from '@/modules/generator-ui/lib/makeFilmWizard'

const DURATIONS: FilmDuration[] = [5, 10, 15, 30, 45, 60, 90, 135]
const ASPECTS: { value: FilmAspect; label: string; dims: string }[] = [
  { value: '16:9', label: 'Landscape (16:9)', dims: '1920×1080' },
  { value: '9:16', label: 'Portrait/Story (9:16)', dims: '1080×1920' },
  { value: '1:1', label: 'Square (1:1)', dims: '1080×1080' },
]

const CAMERA_ANGLES: WizardStyleOption[] = buildWizardCameraOptions()
const THEMES: WizardStyleOption[] = buildWizardThemeOptions()

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

type ProductPhotoSource = { id: string; title: string | null; storagePath: string; imageType?: string | null }

export const inFlightSigns = new Map<string, Promise<string>>()

async function signStorageUrlDeduped(storagePath: string, bucket: string, userId?: string | null): Promise<string> {
  const cacheKey = `${userId ?? 'anon'}:${bucket}:${storagePath}`
  const existing = inFlightSigns.get(cacheKey)
  if (existing) return existing
  const promise = (async () => {
    try {
      const raw = storagePath ?? ''
      if (/^blob:|^data:/.test(raw)) return raw
      if (/\/object\/sign\//.test(raw)) return raw
      const key = storageObjectKey(raw, bucket)
      if (!key) return raw
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(key, 60 * 60 * 24 * 7)
      if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Failed to create signed URL')
      return data.signedUrl
    } finally {
      inFlightSigns.delete(cacheKey)
    }
  })()
  inFlightSigns.set(cacheKey, promise)
  return promise
}

type WizardStep = 'prompt' | 'scenario' | 'images'

export interface FilmIdentity {
  productUrl?: string
  productName?: string | null
  productDescription?: string | null
  characterUrl?: string
  characterName?: string | null
}

export interface IdentityRef {
  url: string
  role: 'product' | 'character'
  imageType?: string | null
  characterSheet: boolean
  name?: string | null
}

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
  const [plans, setPlans] = useState<FilmPlan[]>([])
  const [images, setImages] = useState<(string | undefined)[]>([])
  const [imageErrors, setImageErrors] = useState<(string | undefined)[]>([])
  const [busy, setBusy] = useState<'idle' | 'scenario' | 'images'>('idle')
  const [regenIndex, setRegenIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeError, setOptimizeError] = useState<string | null>(null)
  const [promptBeforeOptimize, setPromptBeforeOptimize] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [duration, setDuration] = useState<FilmDuration>(defaultDuration)
  const [aspect, setAspect] = useState<FilmAspect>(defaultAspect)
  const [withNarration, setWithNarration] = useState(true)
  const [noTextOnImages, setNoTextOnImages] = useState(true)
  const [selectedCameraAngle, setSelectedCameraAngle] = useState('auto')
  const [selectedTheme, setSelectedTheme] = useState('auto')
  const [productPhotos, setProductPhotos] = useState<ProductPhotoSource[]>([])
  const [characterPhotos, setCharacterPhotos] = useState<ProductPhoto[]>([])
  const productPickerControllerRef = useRef<AbortController | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<ProductPhoto | null>(null)
  const [selectedCharacter, setSelectedCharacter] = useState<ProductPhoto | null>(null)
  const [productName, setProductName] = useState<string>('')
  const [identitySnapshot, setIdentitySnapshot] = useState<IdentitySnapshot | null>(null)
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false)
  const [characterSheetSource, setCharacterSheetSource] = useState<CharacterSheetSource | null>(null)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [productLoadError, setProductLoadError] = useState<string | null>(null)
  const [loadingCharacters, setLoadingCharacters] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [lightboxScene, setLightboxScene] = useState<string>('')
  const hasInitialized = useRef(false)

  // Style picker dialogs
  const [cameraPickerOpen, setCameraPickerOpen] = useState(false)
  const [themePickerOpen, setThemePickerOpen] = useState(false)

  useEffect(() => {
    if (open && !hasInitialized.current) {
      hasInitialized.current = true
      setStep('prompt')
      setPrompt(initialPrompt ?? '')
      setPlans([])
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
      setProductName('')
      setIdentitySnapshot(null)
      setProductPickerOpen(false)
      setProductLoadError(null)
      setCharacterPickerOpen(false)
      setCharacterSheetSource(null)
      setLightboxOpen(false)
    }
    if (!open) {
      hasInitialized.current = false
    }
  }, [open, initialPrompt, defaultDuration, defaultAspect])

  const working = busy !== 'idle' || regenIndex !== null
  const canWriteScenario = prompt.trim().length > 0 && selectedProduct !== null && !working

  async function loadProductPhotos() {
    if (!userId) {
      setError('Please sign in to choose a product.')
      return
    }
    setLoadingProducts(true)
    setError(null)
    setProductLoadError(null)
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
      const photos: ProductPhotoSource[] = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          title: r.title ?? null,
          storagePath: r.storage_path,
        })),
      )
      setProductPhotos(photos)
    } catch (e) {
      setProductLoadError((e as Error).message ?? 'Failed to load products')
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
      void fellBack
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load characters')
    } finally {
      setLoadingCharacters(false)
    }
  }

  function pickProduct(photo: ProductPhoto) {
    setSelectedProduct(photo)
    setProductName(sanitizeProductName(photo.title))
    setProductPickerOpen(false)
  }

  function currentProductName(): string | null {
    const manualName = productName.trim()
    if (manualName) return manualName
    return selectedProduct ? sanitizeProductName(selectedProduct.title) : null
  }

  function pickCharacter(photo: ProductPhoto) {
    setSelectedCharacter(photo)
    setCharacterPickerOpen(false)
  }

  function openCharacterSheetFlow(photo: ProductPhoto) {
    setCharacterSheetSource({
      id: photo.id,
      url: photo.url,
      title: photo.title,
    })
  }

  function handleCharacterSheetCreated() {
    setCharacterSheetSource(null)
    void loadCharacterPhotos()
  }

  function isCharacterSheetRef(photo: ProductPhoto | null): boolean {
    return isCharacterSheet(photo?.imageType, photo?.title, photo?.url)
  }

  function toIdentityRef(photo: ProductPhoto | null, role: 'product' | 'character'): IdentityRef | undefined {
    if (!photo) return undefined
    return {
      url: photo.url,
      role,
      imageType: photo.imageType ?? null,
      characterSheet: role === 'character' && isCharacterSheetRef(photo),
      name: role === 'product' ? currentProductName() : photo.title ?? null,
    }
  }

    function generateDurationPrompt(basePrompt: string, durationSeconds: number): string {
    const planCount = expectedPlanCount(durationSeconds)
    
    return `${basePrompt}

IMPORTANT: Create a continuous narrative for a ${durationSeconds}-second film, split into ${planCount} sequential 5-second plans (shots). Total film duration must be ${durationSeconds} seconds.
Each plan should be a self-contained video prompt (subject, action, camera move, lighting) that continues the story from the previous plan. All plans must serve the same overall story goal.`
  }

    async function handleWriteScenario() {
    const idea = prompt.trim()
    if (!selectedProduct) {
      setError('Choose a product before writing the scenario.')
      return
    }
    if (!idea) {
      setError('Type a prompt first so I can write the film.')
      return
    }
    setBusy('scenario')
    setError(null)
    setProgress('Writing your film scenario…')
    try {
      let enrichedPrompt = generateDurationPrompt(idea, duration)
      const resolvedProductName = currentProductName()
      if (selectedProduct && selectedCharacter) {
        enrichedPrompt += `\n\nPRODUCT AND CHARACTER TO FEATURE TOGETHER: The product "${resolvedProductName || 'Selected Product'}" (image: ${selectedProduct.url}) AND the character "${selectedCharacter.title || 'Selected Character'}" (image: ${selectedCharacter.url}) MUST BOTH appear together prominently in every shot of the film. Show the character interacting with or holding the product.`
      } else if (selectedProduct) {
        enrichedPrompt += `\n\nPRODUCT TO FEATURE: ${resolvedProductName || 'Selected Product'}. The product image URL is: ${selectedProduct.url}. This product MUST appear prominently in every shot of the film.`
      } else if (resolvedProductName) {
        enrichedPrompt += `\n\nPRODUCT TO FEATURE: ${resolvedProductName}. This product MUST appear prominently in every shot of the film.`
      } else if (selectedCharacter) {
        enrichedPrompt += `\n\nCHARACTER TO FEATURE: ${selectedCharacter.title || 'Selected Character'}. The character image URL is: ${selectedCharacter.url}. This character MUST appear prominently in every shot of the film.`
      }
      
      const cameraAngle = CAMERA_ANGLES.find((a) => a.value === selectedCameraAngle)
      if (cameraAngle && cameraAngle.prompt) {
        enrichedPrompt += `\n\nCAMERA ANGLE: ${cameraAngle.prompt}`
      }
      
      const theme = THEMES.find((t) => t.value === selectedTheme)
      if (theme && theme.prompt) {
        enrichedPrompt += `\n\nVISUAL STYLE: ${theme.prompt}`
      }
      const written = await writeScenario(enrichedPrompt, {
        duration,
        productUrl: selectedProduct?.url,
        characterUrl: selectedCharacter?.url,
        productName: resolvedProductName,
        characterName: selectedCharacter?.title ?? null,
        withNarration,
        aspect,
        cameraStyle: cameraAngle?.prompt,
        theme: theme?.prompt,
      })
      const rawScenes = written.map((s) => s.trim()).filter((s) => s.length > 0)
      if (rawScenes.length === 0) {
        setError('The scenario came back empty — try rephrasing your prompt.')
        return
      }
      const builtPlans = buildFilmPlans(duration, rawScenes.join("\n\n"), undefined)
      setPlans(builtPlans)
      setImages(new Array(builtPlans.length).fill(undefined))
      setStep('scenario')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write the scenario.')
    } finally {
      setBusy('idle')
      setProgress(null)
    }
  }

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
    if (plans.length === 0) return
    setBusy('images')
    setError(null)
    const snapshot: IdentitySnapshot = {
      product: toIdentityRef(selectedProduct, 'product'),
      character: toIdentityRef(selectedCharacter, 'character'),
    }
    setIdentitySnapshot(snapshot)
    const characterSheet = snapshot.character?.characterSheet ?? false
    const next: (string | undefined)[] = new Array(plans.length).fill(undefined)
    const nextErrors: (string | undefined)[] = new Array(plans.length).fill(undefined)
    const creative = currentCreative()
    for (let i = 0; i < plans.length; i++) {
      setProgress(`Designing preview image ${i + 1} of ${plans.length}…`)
      try {
        next[i] = await generateSceneImage(plans[i].scenarioText, aspect, snapshot.product?.url, snapshot.character?.url, noTextOnImages, creative, characterSheet)
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
      const snapshot = identitySnapshot
      if (!snapshot) throw new Error('The original film identity snapshot is unavailable. Generate the preview batch again.')
      const characterSheet = snapshot.character?.characterSheet ?? false
      const url = await generateSceneImage(plans[index].scenarioText, aspect, snapshot.product?.url, snapshot.character?.url, noTextOnImages, currentCreative(), characterSheet)
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
      onApprove(plans.map((p) => p.scenarioText), images, {
        duration,
        aspect,
        withNarration,
        identity: {
          productUrl: (identitySnapshot?.product ?? toIdentityRef(selectedProduct, 'product'))?.url,
          productName: (identitySnapshot?.product ?? toIdentityRef(selectedProduct, 'product'))?.name ?? currentProductName(),
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

  // Get display labels for selected styles
  const selectedCameraLabel = CAMERA_ANGLES.find((a) => a.value === selectedCameraAngle)?.label ?? 'Auto (AI decides)'
  const selectedThemeLabel = THEMES.find((t) => t.value === selectedTheme)?.label ?? 'Auto (AI decides)'

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
            {step === 'prompt' && (
              <div className="space-y-4">
                {/* Duration selector */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <Clock className="h-3.5 w-3.5" />
                    Film duration
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DURATIONS.map((d) => (
                      <Button
                        key={d}
                        type="button"
                        variant={duration === d ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setDuration(d)}
                        className={`h-8 px-3 text-xs ${
                          duration === d
                            ? 'bg-fuchsia-500/90 text-white hover:bg-fuchsia-500'
                            : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'
                        }`}
                      >
                        {d}s
                      </Button>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    {expectedPlanCount(duration)} shots × 5s each = {duration}s total · {computePlanCredits(expectedPlanCount(duration))} credits
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
                        className={`h-8 gap-1 text-xs ${
                          aspect === a.value
                            ? 'bg-fuchsia-500/90 text-white hover:bg-fuchsia-500'
                            : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'
                        }`}
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
                        <span className="text-xs text-zinc-300">{currentProductName() || 'Product'}</span>
                        <button
                          type="button"
                          onClick={() => { setSelectedProduct(null); setProductName('') }}
                          aria-label="Remove product"
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
                  <Input
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    maxLength={100}
                    aria-label="Product name"
                    placeholder="Product name (type manually or choose a saved product)"
                    disabled={working}
                    className="h-8 border-white/10 bg-white/[0.03] text-xs text-zinc-100 placeholder:text-zinc-500"
                  />
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
                      className={`h-8 gap-1 text-xs ${
                        withNarration
                          ? 'bg-fuchsia-500/90 text-white hover:bg-fuchsia-500'
                          : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      <Mic className="h-3.5 w-3.5" />
                      With narration
                    </Button>
                    <Button
                      type="button"
                      variant={!withNarration ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setWithNarration(false)}
                      className={`h-8 gap-1 text-xs ${
                        !withNarration
                          ? 'bg-fuchsia-500/90 text-white hover:bg-fuchsia-500'
                          : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'
                      }`}
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
                      className={`h-8 gap-1 text-xs ${
                        noTextOnImages
                          ? 'bg-emerald-500/90 text-white hover:bg-emerald-500'
                          : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Clean images (no text)
                    </Button>
                    <Button
                      type="button"
                      variant={!noTextOnImages ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setNoTextOnImages(false)}
                      className={`h-8 gap-1 text-xs ${
                        !noTextOnImages
                          ? 'bg-emerald-500/90 text-white hover:bg-emerald-500'
                          : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'
                      }`}
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      With text overlays
                    </Button>
                  </div>
                </div>

                {/* Camera angle selector - opens dialog */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <Clapperboard className="h-3.5 w-3.5" />
                    Camera angle
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCameraPickerOpen(true)}
                    aria-label={`Camera angle: ${selectedCameraLabel}`}
                    className="w-full h-10 justify-between border-white/10 bg-white/[0.03] text-zinc-100 hover:bg-white/[0.06]"
                  >
                    <span className="text-sm">{selectedCameraLabel}</span>
                    <span className="text-xs text-zinc-500">Click to change</span>
                  </Button>
                </div>

                {/* Visual theme selector - opens dialog */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    <Film className="h-3.5 w-3.5" />
                    Visual theme
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setThemePickerOpen(true)}
                    aria-label={`Visual theme: ${selectedThemeLabel}`}
                    className="w-full h-10 justify-between border-white/10 bg-white/[0.03] text-zinc-100 hover:bg-white/[0.06]"
                  >
                    <span className="text-sm">{selectedThemeLabel}</span>
                    <span className="text-xs text-zinc-500">Click to change</span>
                  </Button>
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
                  Here is the scenario the AI wrote. Edit any shot, then generate one preview image per shot.
                </p>
                <div className="-mx-1 overflow-x-auto overscroll-x-contain px-1 pb-3 scroll-smooth [scrollbar-color:rgb(82_82_91)_transparent] [scrollbar-width:thin]">
                  <div className="flex w-max snap-x snap-proximity gap-3">
                    {plans.map((plan, i) => (
                      <div key={i} className="w-[calc(100vw-4rem)] max-w-[34rem] shrink-0 snap-start space-y-2 rounded-md border border-white/10 bg-white/[0.02] p-4 sm:w-[30rem] lg:w-[34rem]">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-300/90">
                          {plan.label} (~{plan.durationSeconds}s)
                        </div>
                        <Textarea
                          value={plan.scenarioText}
                          onChange={(e) =>
                            setPlans((cur) => {
                              const copy = [...cur]
                              copy[i] = { ...copy[i], scenarioText: e.target.value }
                              return copy
                            })
                          }
                          rows={3}
                          className="min-h-44 w-full resize-none overflow-y-auto border-white/10 bg-white/[0.03] text-sm leading-6 text-zinc-100 [overflow-wrap:anywhere]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3 — review preview images with zoom. */}
            {step === 'images' && (
              <div className="space-y-3">
                <p className="text-sm text-zinc-300">
                  One preview image per shot. Click to zoom. Regenerate any you dislike. Preview final film before approving.
                </p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {plans.map((plan, i) => {
                    const url = safeMediaUrl(images[i])
                    const isRegen = regenIndex === i
                    const sceneError = imageErrors[i]
                    return (
                      <div key={i} className="space-y-2 rounded-md border border-white/10 bg-white/[0.02] p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-300/90">
                            {plan.label}
                          </div>
                          <div className="flex items-center gap-1">
                            {url && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => openLightbox(url, plan.scenarioText)}
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
                          onClick={() => url && openLightbox(url, plan.scenarioText)}
                        >
                          {isRegen ? (
                            <LoaderCircle className="h-6 w-6 animate-spin text-zinc-500" aria-hidden="true" />
                          ) : url ? (
                            <img src={url} alt={`Preview for ${plan.label}`} className="h-full w-full object-cover max-h-[240px]" />
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
                        <p className="line-clamp-2 text-[11px] leading-4 text-zinc-500">{plan.scenarioText}</p>
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
                  disabled={!canWriteScenario}
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
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">
                    {plans.length} shots · {computePlanCredits(plans.length)} credits
                  </span>
                  <Button
                    type="button"
                    disabled={working || !canApproveFilm(images)}
                    onClick={handleApprove}
                    className="gap-1.5 bg-emerald-500/90 text-white hover:bg-emerald-500"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Approve & Make Film
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Camera Angle Picker Dialog */}
      <StylePickerDialog
        open={cameraPickerOpen}
        onOpenChange={setCameraPickerOpen}
        title="Select Camera Angle"
        icon="camera"
        options={CAMERA_ANGLES}
        selectedValue={selectedCameraAngle}
        onSelect={setSelectedCameraAngle}
        onApply={() => {}}
      />

      {/* Visual Theme Picker Dialog */}
      <StylePickerDialog
        open={themePickerOpen}
        onOpenChange={setThemePickerOpen}
        title="Select Visual Theme"
        icon="theme"
        options={THEMES}
        selectedValue={selectedTheme}
        onSelect={setSelectedTheme}
        onApply={() => {}}
      />

      {/* Product Picker Dialog */}
      <Dialog open={productPickerOpen} onOpenChange={(open) => {
        setProductPickerOpen(open)
        if (open) {
          productPickerControllerRef.current = new AbortController()
          void loadProductPhotos()
        } else {
          productPickerControllerRef.current?.abort()
          productPickerControllerRef.current = new AbortController()
        }
      }}>
        <DialogContent className="max-w-lg border-white/10 bg-zinc-950/95 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base">Choose a product</DialogTitle>
            <DialogDescription>
              Select a saved product image to keep the product consistent throughout the film.
            </DialogDescription>
          </DialogHeader>
          {loadingProducts ? (
            <div className="flex items-center justify-center py-10 text-sm text-zinc-400">
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Loading products…
            </div>
          ) : productLoadError ? (
            <div className="space-y-3 py-10 text-center text-sm text-rose-300">
              <p>Could not load your saved products: {productLoadError}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => { void loadProductPhotos() }}>
                Try again
              </Button>
            </div>
          ) : productPhotos.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-500">No saved product photos yet.</div>
          ) : (
            <div className="grid max-h-[50vh] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
              {productPhotos.map((photo) => (
                <ProductPickerCard
                  key={photo.id}
                  photo={photo}
                  bucket={PRODUCTS_BUCKET}
                  userId={userId}
                  controllerRef={productPickerControllerRef}
                  onSelect={pickProduct}
                />
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
            <DialogDescription>
              Select a saved character or character sheet to feature throughout the film.
            </DialogDescription>
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
                <div
                  key={photo.id}
                  className="group relative overflow-hidden rounded-md border border-white/10 bg-black/30 transition hover:border-amber-300/40"
                >
                  <button
                    type="button"
                    onClick={() => pickCharacter(photo)}
                    className="block w-full text-left"
                  >
                    <img src={photo.url} alt={photo.title ?? 'Character'} loading="lazy" className="aspect-square w-full bg-black/40 object-cover" />
                    <div className="truncate px-2 py-1 text-[11px] text-zinc-200">{photo.title || 'Untitled'}</div>
                  </button>
                  {!isCharacterSheetRef(photo) ? (
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Create character sheet for ${photo.title || 'Untitled'}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              openCharacterSheetFlow(photo)
                            }}
                            className="absolute right-1.5 top-1.5 grid h-10 w-10 touch-manipulation place-items-center rounded-full border border-white/15 bg-black/75 text-fuchsia-200 shadow-sm transition hover:border-fuchsia-300/50 hover:bg-fuchsia-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
                          >
                            <Sparkles className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          Create character sheet
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CharacterSheetDialog
        open={characterSheetSource !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setCharacterSheetSource(null)
        }}
        userId={userId}
        initialCharacter={characterSheetSource}
        onSheetCreated={handleCharacterSheetCreated}
      />

      {/* Lightbox for zoom */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl border-white/10 bg-zinc-950/95 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base">Preview</DialogTitle>
            <DialogDescription>
              Review the selected scene image at full size before approving the film.
            </DialogDescription>
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

/**
 * Per-card retry state.
 *  'loading'   – signing in progress; spinner shown; disabled.
 *  'ready'     – signed URL obtained; <img> rendered; onLoad will → 'idle'.
 *  'idle'      – image loaded; selectable.
 *  'retrying'  – re-sign after error; spinner shown; disabled.
 *  'failed'    – exhausted retries; fallback shown; disabled.
 */
type CardRetryState = 'loading' | 'ready' | 'idle' | 'retrying' | 'failed'

let globalCardEpoch = 0

/**
 * Re-sign a single product photo URL.  Stale responses (after dialog
 * close, unmount, or user change) are dropped via an epoch nonce.
 */
function useResilientPhotoCard(
  photo: ProductPhotoSource,
  bucket: string,
  userId: string | null,
  controllerRef: React.MutableRefObject<AbortController | null>,
) {
  const [signedUrl, setSignedUrl] = useState<string>('')
  const [retryState, setRetryState] = useState<CardRetryState>('loading')
  const epochRef = useRef(0)
  const retryCountRef = useRef(0)

  // On mount or identity change, start signing.  Any previous epoch
  // is implicitly abandoned by the component unmounting.
  useEffect(() => {
    let cancelled = false
    setRetryState('loading')
    setSignedUrl('')
    retryCountRef.current = 0
    const nonce = ++globalCardEpoch
    epochRef.current = nonce

    async function sign() {
      try {
        const fresh = await signStorageUrlDeduped(photo.storagePath, bucket, userId)
        if (cancelled) return
        if (epochRef.current !== nonce) return
        setSignedUrl(fresh)
        setRetryState('ready')
      } catch {
        if (cancelled) return
        if (epochRef.current !== nonce) return
        setRetryState('failed')
      }
    }

    void sign()

    return () => { cancelled = true }
  }, [photo.id, photo.storagePath, bucket, userId])

  const handleLoad = useCallback(() => {
    setRetryState('idle')
  }, [])

  const handleRetry = useCallback(async () => {
    const nonce = ++globalCardEpoch
    epochRef.current = nonce
    setRetryState('retrying')
    try {
      const fresh = await signStorageUrlDeduped(photo.storagePath, bucket, userId)
      if (epochRef.current !== nonce) return
      setSignedUrl(fresh)
      setRetryState('ready')
    } catch {
      if (epochRef.current !== nonce) return
      setRetryState('failed')
    }
  }, [photo.storagePath, bucket, userId])

  const handleImageError = useCallback(() => {
    if (retryCountRef.current === 0) {
      retryCountRef.current = 1
      void handleRetry()
    } else {
      setRetryState('failed')
    }
  }, [handleRetry])

  return { signedUrl, retryState, handleLoad, handleImageError, handleRetry }
}

/**
 * A single product card.  The image is never rendered with a raw
 * storage path — a fresh signed URL is obtained first.  The card is
 * disabled until the image successfully loads (onLoad).  onError
 * triggers one automatic re-sign; a second failure shows a "Try again"
 * button that executes a fresh signing attempt immediately.
 */
function ProductPickerCard({
  photo,
  bucket,
  userId,
  controllerRef,
  onSelect,
}: {
  photo: ProductPhotoSource
  bucket: string
  userId: string | null
  controllerRef: React.MutableRefObject<AbortController | null>
  onSelect: (photo: ProductPhoto) => void
}) {
  const { signedUrl, retryState, handleLoad, handleImageError, handleRetry } = useResilientPhotoCard(
    photo,
    bucket,
    userId,
    controllerRef,
  )
  const selectable = retryState === 'idle' || retryState === 'ready'

  if (retryState === 'failed') {
    return (
      <div className="relative overflow-hidden rounded-md border border-white/10 bg-zinc-900/60 p-2 text-center">
        <div className="flex aspect-square w-full items-center justify-center bg-zinc-800/50">
          <ImageIcon className="h-6 w-6 text-zinc-500" aria-hidden="true" />
        </div>
        <div className="mt-2 truncate text-[11px] text-zinc-400">{photo.title || 'Untitled'}</div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => { void handleRetry() }}
          className="mt-1 h-6 text-[10px] text-rose-300 hover:text-rose-200"
        >
          <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
          Try again
        </Button>
      </div>
    )
  }

  const showSpinner = retryState === 'loading' || retryState === 'retrying'
  const showImage = retryState === 'ready' || retryState === 'idle'

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={() => onSelect({ id: photo.id, title: photo.title, url: signedUrl })}
      className={`group relative overflow-hidden rounded-md border border-white/10 bg-black/30 text-left transition hover:border-fuchsia-300/40 ${
        selectable ? '' : 'cursor-not-allowed opacity-60'
      }`}
    >
      {showSpinner && (
        <div className="flex aspect-square w-full items-center justify-center bg-black/40">
          <LoaderCircle className="h-5 w-5 animate-spin text-zinc-300" aria-hidden="true" />
        </div>
      )}
      {showImage && (
        <img
          src={signedUrl}
          alt={photo.title ?? 'Product'}
          loading="lazy"
          className="aspect-square w-full bg-black/40 object-cover"
          onLoad={handleLoad}
          onError={handleImageError}
        />
      )}
      <div className="truncate px-2 py-1 text-[11px] text-zinc-200">{photo.title || 'Untitled'}</div>
    </button>
  )
}
