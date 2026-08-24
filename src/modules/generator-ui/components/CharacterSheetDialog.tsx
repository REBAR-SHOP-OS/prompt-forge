import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  Drama,
  ImageOff,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  RefreshCw,
  Sparkles,
  Trash2,
  UserRound,
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
import { supabase } from '@/integrations/supabase/client'
import { signUrl } from '@/modules/generator-ui/lib/characterSheetUrl'

const USER_IMAGES_BUCKET = 'user-images'
const CHARACTER_CATEGORY = 'character'

type SheetModel = 'fast' | 'quality' | 'detailed'

const SHEET_MODELS: { key: SheetModel; label: string; hint: string }[] = [
  { key: 'fast', label: 'Fast', hint: 'Quick & cheap' },
  { key: 'quality', label: 'High quality', hint: 'Best detail' },
  { key: 'detailed', label: 'Detailed', hint: 'Text & fine detail' },
]

type CharacterImage = {
  id: string
  /** Durable storage reference (raw key or public URL) — exactly what the DB holds. */
  storage_path: string
  /** In-memory only: a fresh signed URL for display. Never persisted. */
  signedUrl?: string | null
  created_at?: string
  title?: string | null
}

export type CharacterSheetSource = {
  id: string
  url: string
  title: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string | null
  onUseCharacter?: (c: { id: string; url: string; title: string | null }) => void
  initialCharacter?: CharacterSheetSource | null
  onSheetCreated?: (c: { id: string; url: string; title: string | null }) => void
}

type ImageUrlState = 'loading' | 'ready' | 'idle' | 'retrying' | 'failed'

/**
 * Resilient signed-URL lifecycle for a single character image.
 *
 *  - Starts `ready` when a signed URL was already produced at load time.
 *  - Starts `failed` when load-time signing already failed (no double attempt).
 *  - `onError` re-signs exactly once; a second failure stays `failed`.
 *  - `handleRetry` is the manual "Try again" path (unlimited, user-driven).
 */
function useCharacterImageUrl(storagePath: string, initialSignedUrl: string | null) {
  const [signedUrl, setSignedUrl] = useState<string | null>(initialSignedUrl)
  const [state, setState] = useState<ImageUrlState>(initialSignedUrl ? 'ready' : 'failed')
  const retryRef = useRef(0)

  const handleLoad = useCallback(() => setState('idle'), [])

  const handleError = useCallback(() => {
    if (retryRef.current === 0) {
      retryRef.current = 1
      setState('retrying')
      void signUrl(storagePath).then((url) => {
        if (url) {
          setSignedUrl(url)
          setState('ready')
        } else {
          setState('failed')
        }
      })
    } else {
      setState('failed')
    }
  }, [storagePath])

  const handleRetry = useCallback(() => {
    retryRef.current = 0
    setState('retrying')
    void signUrl(storagePath).then((url) => {
      if (url) {
        setSignedUrl(url)
        setState('ready')
      } else {
        setState('failed')
      }
    })
  }, [storagePath])

  return { signedUrl, state, handleLoad, handleError, handleRetry }
}

/**
 * Character Sheet dialog — a simple uploader.
 * The user uploads one or more character images that are saved for later use
 * as a character reference. No scenario generation, no description field.
 */
export default function CharacterSheetDialog({
  open,
  onOpenChange,
  userId,
  onUseCharacter,
  initialCharacter,
  onSheetCreated,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const [images, setImages] = useState<CharacterImage[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheetModel, setSheetModel] = useState<SheetModel>('fast')
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [failedGenerationId, setFailedGenerationId] = useState<string | null>(null)
  const [zoomImage, setZoomImage] = useState<CharacterImage | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoSendUrl, setLogoSendUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [applyLogo, setApplyLogo] = useState(false)
  const [promptText, setPromptText] = useState('')
  // Explicit user choice on manual upload: is this file a multi-view character
  // sheet (a single image with several turnaround views + facial expressions of
  // ONE person) or a plain character photo? This is stored as persistent
  // image_type metadata so the wizard/evaluator never guess from title or URL.
  const [uploadIsSheet, setUploadIsSheet] = useState(false)


  useEffect(() => {
    if (!open) {
      setLogoUrl(null)
      setLogoSendUrl(null)
      setApplyLogo(false)
      setFailedGenerationId(null)
    }
  }, [open])


  useEffect(() => {
    if (!open || !userId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const { data, error: qErr } = await supabase
          .from('generator_user_images')
          .select('id, storage_path, created_at, title')
          .eq('user_id', userId)
          .eq('category', CHARACTER_CATEGORY)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
        if (qErr) throw qErr
        const rows = (data ?? []) as CharacterImage[]
        // Always build a fresh signed URL on load; never trust a stored signed
        // URL (it may be expired). `storage_path` stays the durable reference.
        const signed = await Promise.all(
          rows.map(async (r) => ({ ...r, signedUrl: await signUrl(r.storage_path) })),
        )
        if (!cancelled) setImages(signed)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load characters.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, userId])

  const handlePick = () => {
    if (uploading) return
    fileInputRef.current?.click()
  }

  const handleSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0 || !userId) return
    setError(null)
    setUploading(true)
    const errors: string[] = []
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          errors.push(`${file.name}: not an image`)
          continue
        }
        if (file.size > 10 * 1024 * 1024) {
          errors.push(`${file.name}: must be smaller than 10 MB`)
          continue
        }
        try {
          const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
          const path = `${userId}/${crypto.randomUUID()}.${ext}`
          const up = await supabase.storage
            .from(USER_IMAGES_BUCKET)
            .upload(path, file, { contentType: file.type, upsert: false })
          if (up.error) throw up.error
          const { data: pub } = supabase.storage.from(USER_IMAGES_BUCKET).getPublicUrl(path)
          const { data: row, error: insErr } = await supabase
            .from('generator_user_images')
            .insert({
              user_id: userId,
              storage_path: pub.publicUrl,
              size_bytes: file.size,
              mime_type: file.type,
              category: CHARACTER_CATEGORY,
              // Explicit, persistent type: the user decides whether this upload
              // is a character sheet or a plain character. Never guessed from
              // the file name or URL.
              image_type: uploadIsSheet ? 'character_sheet' : 'character',
              title: file.name.replace(/\.[^/.]+$/, '').slice(0, 100) || null,
            })
            .select('id, storage_path, created_at, title, image_type')
            .single()
          if (insErr) throw insErr
          const signed = {
            ...(row as CharacterImage),
            signedUrl: await signUrl((row as CharacterImage).storage_path),
          }
          setImages((prev) => [signed, ...prev])
        } catch (err) {
          errors.push(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`)
        }
      }
      if (errors.length > 0) setError(errors.join(' · '))
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (imageId: string) => {
    if (!userId) return
    setImages((prev) => prev.filter((i) => i.id !== imageId))
    try {
      await supabase.rpc('generator_delete_user_image', { _user_id: userId, _image_id: imageId })
    } catch {
      /* optimistic; ignore */
    }
  }

  const handlePickLogo = () => {
    if (logoUploading) return
    logoInputRef.current?.click()
  }

  const handleLogoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !userId) return
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Logo must be an image.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Logo must be smaller than 10 MB.')
      return
    }
    setLogoUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
      const path = `${userId}/logo-${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage
        .from(USER_IMAGES_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })
      if (up.error) throw up.error
      const { data: pub } = supabase.storage.from(USER_IMAGES_BUCKET).getPublicUrl(path)
      // Prefer a signed URL; fall back to the public URL (bucket is public) so
      // the logo still renders if signing is unavailable.
      const signedLogo = (await signUrl(pub.publicUrl)) ?? pub.publicUrl
      setLogoSendUrl(signedLogo)
      setLogoUrl(signedLogo)
      setApplyLogo(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logo upload failed.')
    } finally {
      setLogoUploading(false)
    }
  }

  const handleRemoveLogo = () => {
    setLogoUrl(null)
    setLogoSendUrl(null)
    setApplyLogo(false)
  }

  const handleGenerateSheet = async (img: CharacterImage, imageUrl: string) => {
    if (!userId || generatingId) return
    setError(null)
    setFailedGenerationId(null)
    setGeneratingId(img.id)
    try {
      const useLogo = applyLogo && !!logoSendUrl
      const { data, error: fnErr } = await supabase.functions.invoke('generate-character-sheet', {
        body: {
          imageUrl,
          model: sheetModel,
          title: img.title ?? '',
          ...(useLogo ? { logoUrl: logoSendUrl, applyLogo: true } : {}),
        },
      })
      if (fnErr) throw fnErr
      const row = data as CharacterImage | null
      if (!row?.id) throw new Error('No sheet returned')
      const signed = { ...row, signedUrl: await signUrl(row.storage_path) }
      setImages((prev) => [signed, ...prev])
      onSheetCreated?.({
        id: signed.id,
        url: signed.signedUrl ?? signed.storage_path,
        title: signed.title ?? null,
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : ''
      setError(
        detail
          ? `Could not create the character sheet: ${detail}`
          : 'Could not create the character sheet. Please try again.',
      )
      setFailedGenerationId(img.id)
    } finally {
      setGeneratingId(null)
    }
  }

  const handleGenerateFromPrompt = async () => {
    const prompt = promptText.trim()
    if (!userId || generatingId || !prompt) return
    setError(null)
    setGeneratingId('prompt')
    try {
      const useLogo = applyLogo && !!logoSendUrl
      const { data, error: fnErr } = await supabase.functions.invoke('generate-character-sheet', {
        body: {
          prompt,
          model: sheetModel,
          title: '',
          ...(useLogo ? { logoUrl: logoSendUrl, applyLogo: true } : {}),
        },
      })
      if (fnErr) throw fnErr
      const row = data as CharacterImage | null
      if (!row?.id) throw new Error('No sheet returned')
      const signed = { ...row, signedUrl: await signUrl(row.storage_path) }
      setImages((prev) => [signed, ...prev])
      setPromptText('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate character sheet.'
      setError(msg)
    } finally {
      setGeneratingId(null)
    }
  }



  const handleUse = (img: CharacterImage, signedUrl: string) => {
    onUseCharacter?.({ id: img.id, url: signedUrl, title: img.title ?? null })
    onOpenChange(false)
  }




  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Drama className="h-5 w-5 text-fuchsia-400" aria-hidden="true" />
            Character Sheet
          </DialogTitle>
          <DialogDescription>
            Upload a character photo, then generate a full character sheet with the model of your
            choice. JPG, PNG or WEBP — up to 10 MB.
          </DialogDescription>

        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { void handleSelected(e) }}
        />

        <div className="space-y-4">
          <Button
            type="button"
            onClick={handlePick}
            disabled={uploading || !userId}
            className="w-full gap-2"
          >
            {uploading ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
            )}
            {uploading ? 'Uploading…' : 'Upload character'}
          </Button>

          <label
            className={`flex items-center gap-2 text-xs ${
              userId ? 'text-zinc-300' : 'cursor-not-allowed text-zinc-600'
            }`}
          >
            <input
              type="checkbox"
              checked={uploadIsSheet}
              disabled={!userId}
              onChange={(e) => setUploadIsSheet(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-transparent accent-fuchsia-500"
            />
            This upload is a multi-view character sheet (turnaround views + facial
            expressions of one person)
          </label>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-zinc-400">Character sheet model</p>
            <div className="grid grid-cols-3 gap-2">
              {SHEET_MODELS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setSheetModel(m.key)}
                  className={`rounded-lg border px-2 py-2 text-center transition ${
                    sheetModel === m.key
                      ? 'border-fuchsia-400/70 bg-fuchsia-500/10 text-fuchsia-200'
                      : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20'
                  }`}
                >
                  <span className="block text-xs font-medium">{m.label}</span>
                  <span className="block text-[10px] text-zinc-500">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {initialCharacter ? (
            <div className="flex items-center gap-3 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/[0.06] p-3">
              <img
                src={initialCharacter.url}
                alt={initialCharacter.title ?? 'Source character'}
                className="h-16 w-16 shrink-0 rounded-md border border-white/10 object-cover"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <p className="text-xs font-medium text-fuchsia-200">Source character</p>
                  <p className="truncate text-xs text-zinc-400">
                    {initialCharacter.title || 'Untitled'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void handleGenerateSheet(
                      {
                        id: initialCharacter.id,
                        storage_path: initialCharacter.url,
                        title: initialCharacter.title,
                      },
                      initialCharacter.url,
                    )
                  }}
                  disabled={generatingId !== null}
                  className="w-full gap-1.5 bg-fuchsia-600 text-white hover:bg-fuchsia-500"
                >
                  {generatingId === initialCharacter.id ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {generatingId === initialCharacter.id
                    ? 'Creating character sheet…'
                    : failedGenerationId === initialCharacter.id
                      ? 'Try again'
                      : 'Create character sheet'}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs font-medium text-zinc-400">Describe a character (optional)</p>
            <Textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="e.g. A friendly robot barista with a round head, teal apron and glowing blue eyes"
              maxLength={1000}
              rows={3}
              className="resize-none bg-transparent text-sm"
            />
            <Button
              type="button"
              onClick={() => { void handleGenerateFromPrompt() }}
              disabled={!userId || !promptText.trim() || !!generatingId}
              className="w-full gap-2"
            >
              {generatingId === 'prompt' ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              {generatingId === 'prompt' ? 'Generating…' : 'Generate from prompt'}
            </Button>
          </div>



          <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs font-medium text-zinc-400">Company logo (optional)</p>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { void handleLogoSelected(e) }}
            />
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Company logo"
                  className="h-12 w-12 shrink-0 rounded-md border border-white/10 bg-white object-contain"
                />
              ) : (
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-dashed border-white/15 text-zinc-500">
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                </div>
              )}
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePickLogo}
                  disabled={logoUploading || !userId}
                  className="gap-2"
                >
                  {logoUploading ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {logoUrl ? 'Replace logo' : 'Upload logo'}
                </Button>
                {logoUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveLogo}
                    className="gap-1 text-zinc-400 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
            <label
              className={`flex items-center gap-2 text-xs ${
                logoUrl ? 'text-zinc-300' : 'cursor-not-allowed text-zinc-600'
              }`}
            >
              <input
                type="checkbox"
                checked={applyLogo}
                disabled={!logoUrl}
                onChange={(e) => setApplyLogo(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-transparent accent-fuchsia-500"
              />
              Apply logo to character when generating the sheet
            </label>
          </div>


          {error ? <p className="text-xs text-rose-400">{error}</p> : null}


          {loading ? (
            <div className="flex items-center justify-center py-8 text-zinc-500">
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
            </div>
          ) : images.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">No characters uploaded yet.</p>
          ) : (
            <div className="grid max-h-[50vh] grid-cols-3 gap-3 overflow-y-auto">
              {images.map((img) => (
                <CharacterImageCard
                  key={img.id}
                  img={img}
                  onZoom={setZoomImage}
                  onDelete={(id) => { void handleDelete(id) }}
                  onUse={onUseCharacter ? handleUse : undefined}
                  onGenerate={(i, url) => { void handleGenerateSheet(i, url) }}
                  generatingId={generatingId}
                  failedGenerationId={failedGenerationId}
                />
              ))}
            </div>
          )}
        </div>

        {/* Zoom lightbox */}
        <Dialog open={zoomImage !== null} onOpenChange={(o) => { if (!o) setZoomImage(null) }}>
          <DialogContent className="max-w-3xl border-white/10 bg-black p-2">
            {zoomImage ? (
              <CharacterImageZoom
                img={zoomImage}
                onUse={onUseCharacter ? handleUse : undefined}
              />
            ) : null}
          </DialogContent>
        </Dialog>

      </DialogContent>
    </Dialog>
  )
}

function CharacterImageCard({
  img,
  onZoom,
  onDelete,
  onUse,
  onGenerate,
  generatingId,
  failedGenerationId,
}: {
  img: CharacterImage
  onZoom: (img: CharacterImage) => void
  onDelete: (id: string) => void
  onUse?: (img: CharacterImage, signedUrl: string) => void
  onGenerate: (img: CharacterImage, signedUrl: string) => void
  generatingId: string | null
  failedGenerationId: string | null
}) {
  const { signedUrl, state, handleLoad, handleError, handleRetry } = useCharacterImageUrl(
    img.storage_path,
    img.signedUrl ?? null,
  )
  const ready = state === 'ready' || state === 'idle'
  const showSpinner = state === 'loading' || state === 'retrying'

  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
      {showSpinner && (
        <div className="flex h-full w-full items-center justify-center bg-black/40">
          <LoaderCircle className="h-5 w-5 animate-spin text-zinc-300" aria-hidden="true" />
        </div>
      )}

      {state === 'failed' && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-900/60 p-2 text-center">
          <ImageOff className="h-6 w-6 text-zinc-500" aria-hidden="true" />
          <span className="text-[10px] text-zinc-500">Image unavailable</span>
          <button
            type="button"
            onClick={() => { void handleRetry() }}
            className="mt-1 flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[10px] text-zinc-200 transition hover:bg-white/20"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Try again
          </button>
        </div>
      )}

      {ready && signedUrl && (
        <button
          type="button"
          onClick={() => onZoom(img)}
          aria-label="Zoom character"
          className="block h-full w-full cursor-zoom-in"
        >
          <img
            src={signedUrl}
            alt={img.title ?? 'Character'}
            className="h-full w-full object-cover"
            loading="lazy"
            onLoad={handleLoad}
            onError={handleError}
          />
        </button>
      )}

      {ready && signedUrl && (
        <button
          type="button"
          onClick={() => onZoom(img)}
          aria-label="Zoom character"
          className="absolute left-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-zinc-200 opacity-0 transition hover:bg-black/80 hover:text-white group-hover:opacity-100"
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}

      <button
        type="button"
        onClick={() => onDelete(img.id)}
        aria-label="Delete character"
        className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-zinc-200 opacity-0 transition hover:bg-rose-600 hover:text-white group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {ready && signedUrl && (
        <div className="absolute inset-x-1.5 bottom-1.5 flex flex-col gap-1 opacity-0 transition group-hover:opacity-100">
          {onUse ? (
            <button
              type="button"
              onClick={() => onUse(img, signedUrl)}
              className="flex items-center justify-center gap-1 rounded-md bg-emerald-600/90 px-2 py-1.5 text-[11px] font-medium text-white transition hover:bg-emerald-500"
            >
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              Use as character
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onGenerate(img, signedUrl)}
            disabled={generatingId !== null}
            className="flex items-center justify-center gap-1 rounded-md bg-fuchsia-600/90 px-2 py-1.5 text-[11px] font-medium text-white transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generatingId === img.id ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {generatingId === img.id ? 'Generating…' : 'Make sheet'}
          </button>
        </div>
      )}
    </div>
  )
}

function CharacterImageZoom({
  img,
  onUse,
}: {
  img: CharacterImage
  onUse?: (img: CharacterImage, signedUrl: string) => void
}) {
  const { signedUrl, state, handleLoad, handleError, handleRetry } = useCharacterImageUrl(
    img.storage_path,
    img.signedUrl ?? null,
  )
  const ready = state === 'ready' || state === 'idle'
  const showSpinner = state === 'loading' || state === 'retrying'

  return (
    <div className="relative">
      {showSpinner && (
        <div className="flex h-64 w-full items-center justify-center">
          <LoaderCircle className="h-6 w-6 animate-spin text-zinc-300" aria-hidden="true" />
        </div>
      )}

      {state === 'failed' && (
        <div className="flex h-64 w-full flex-col items-center justify-center gap-2">
          <ImageOff className="h-8 w-8 text-zinc-500" aria-hidden="true" />
          <span className="text-sm text-zinc-500">Image unavailable</span>
          <button
            type="button"
            onClick={() => { void handleRetry() }}
            className="flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-white/20"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </button>
        </div>
      )}

      {ready && signedUrl && (
        <img
          src={signedUrl}
          alt={img.title ?? 'Character'}
          className="max-h-[80vh] w-full rounded-md object-contain"
          onLoad={handleLoad}
          onError={handleError}
        />
      )}

      {onUse && ready && signedUrl ? (
        <button
          type="button"
          onClick={() => onUse(img, signedUrl)}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-emerald-600/90 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-emerald-500"
        >
          <UserRound className="h-4 w-4" aria-hidden="true" />
          Use as character
        </button>
      ) : null}
    </div>
  )
}
