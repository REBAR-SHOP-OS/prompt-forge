import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Drama, ImagePlus, LoaderCircle, Maximize2, Sparkles, Trash2, UserRound } from 'lucide-react'
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
const CHARACTER_CATEGORY = 'character'

type SheetModel = 'fast' | 'quality' | 'detailed'

const SHEET_MODELS: { key: SheetModel; label: string; hint: string }[] = [
  { key: 'fast', label: 'Fast', hint: 'Quick & cheap' },
  { key: 'quality', label: 'High quality', hint: 'Best detail' },
  { key: 'detailed', label: 'Detailed', hint: 'Text & fine detail' },
]

type CharacterImage = {
  id: string
  storage_path: string
  created_at: string
  title?: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string | null
  onUseCharacter?: (c: { id: string; url: string; title: string | null }) => void
}


function objectKey(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null
  const marker = `/${USER_IMAGES_BUCKET}/`
  const idx = storagePath.indexOf(marker)
  if (idx >= 0) return storagePath.slice(idx + marker.length)
  if (!/^https?:|^blob:|^data:/.test(storagePath)) return storagePath
  return null
}

async function signUrl(storagePath: string | null | undefined): Promise<string> {
  const raw = storagePath ?? ''
  if (/^blob:|^data:/.test(raw)) return raw
  if (/\/object\/sign\//.test(raw)) return raw
  const key = objectKey(raw)
  if (!key) return raw
  try {
    const { data, error } = await supabase.storage
      .from(USER_IMAGES_BUCKET)
      .createSignedUrl(key, 60 * 60 * 24 * 365)
    if (!error && data?.signedUrl) return data.signedUrl
  } catch {
    /* fall through */
  }
  return raw
}

/**
 * Character Sheet dialog — a simple uploader.
 * The user uploads one or more character images that are saved for later use
 * as a character reference. No scenario generation, no description field.
 */
export default function CharacterSheetDialog({ open, onOpenChange, userId, onUseCharacter }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const [images, setImages] = useState<CharacterImage[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheetModel, setSheetModel] = useState<SheetModel>('fast')
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [zoomImage, setZoomImage] = useState<CharacterImage | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoSendUrl, setLogoSendUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [applyLogo, setApplyLogo] = useState(false)
  const [promptText, setPromptText] = useState('')


  useEffect(() => {
    if (!open) {
      setLogoUrl(null)
      setLogoSendUrl(null)
      setApplyLogo(false)
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
        const signed = await Promise.all(
          rows.map(async (r) => ({ ...r, storage_path: await signUrl(r.storage_path) })),
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
              title: file.name.replace(/\.[^/.]+$/, '').slice(0, 100) || null,
            })
            .select('id, storage_path, created_at, title')
            .single()
          if (insErr) throw insErr
          const signed = { ...(row as CharacterImage), storage_path: await signUrl((row as CharacterImage).storage_path) }
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
      const signedLogo = await signUrl(pub.publicUrl)
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

  const handleGenerateSheet = async (img: CharacterImage) => {
    if (!userId || generatingId) return
    setError(null)
    setGeneratingId(img.id)
    try {
      const useLogo = applyLogo && !!logoSendUrl
      const { data, error: fnErr } = await supabase.functions.invoke('generate-character-sheet', {
        body: {
          imageUrl: img.storage_path,
          model: sheetModel,
          title: img.title ?? '',
          ...(useLogo ? { logoUrl: logoSendUrl, applyLogo: true } : {}),
        },
      })
      if (fnErr) throw fnErr
      const row = data as CharacterImage | null
      if (!row?.id) throw new Error('No sheet returned')
      const signed = { ...row, storage_path: await signUrl(row.storage_path) }
      setImages((prev) => [signed, ...prev])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate character sheet.'
      setError(msg)
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
      const signed = { ...row, storage_path: await signUrl(row.storage_path) }
      setImages((prev) => [signed, ...prev])
      setPromptText('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate character sheet.'
      setError(msg)
    } finally {
      setGeneratingId(null)
    }
  }



  const handleUse = (img: CharacterImage) => {
    onUseCharacter?.({ id: img.id, url: img.storage_path, title: img.title ?? null })
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
                <div
                  key={img.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]"
                >
                  <button
                    type="button"
                    onClick={() => setZoomImage(img)}
                    aria-label="Zoom character"
                    className="block h-full w-full cursor-zoom-in"
                  >
                    <img
                      src={img.storage_path}
                      alt={img.title ?? 'Character'}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomImage(img)}
                    aria-label="Zoom character"
                    className="absolute left-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-zinc-200 opacity-0 transition hover:bg-black/80 hover:text-white group-hover:opacity-100"
                  >
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleDelete(img.id) }}
                    aria-label="Delete character"
                    className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-zinc-200 opacity-0 transition hover:bg-rose-600 hover:text-white group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <div className="absolute inset-x-1.5 bottom-1.5 flex flex-col gap-1 opacity-0 transition group-hover:opacity-100">
                    {onUseCharacter ? (
                      <button
                        type="button"
                        onClick={() => handleUse(img)}
                        className="flex items-center justify-center gap-1 rounded-md bg-emerald-600/90 px-2 py-1.5 text-[11px] font-medium text-white transition hover:bg-emerald-500"
                      >
                        <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                        Use as character
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => { void handleGenerateSheet(img) }}
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
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Zoom lightbox */}
        <Dialog open={zoomImage !== null} onOpenChange={(o) => { if (!o) setZoomImage(null) }}>
          <DialogContent className="max-w-3xl border-white/10 bg-black p-2">
            {zoomImage ? (
              <div className="relative">
                <img
                  src={zoomImage.storage_path}
                  alt={zoomImage.title ?? 'Character'}
                  className="max-h-[80vh] w-full rounded-md object-contain"
                />
                {onUseCharacter ? (
                  <button
                    type="button"
                    onClick={() => handleUse(zoomImage)}
                    className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-emerald-600/90 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-emerald-500"
                  >
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                    Use as character
                  </button>
                ) : null}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

      </DialogContent>
    </Dialog>
  )
}
