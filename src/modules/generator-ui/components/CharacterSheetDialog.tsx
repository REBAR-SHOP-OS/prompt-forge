import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Drama, ImagePlus, LoaderCircle, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'

const USER_IMAGES_BUCKET = 'user-images'
const CHARACTER_CATEGORY = 'character'

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
export default function CharacterSheetDialog({ open, onOpenChange, userId }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [images, setImages] = useState<CharacterImage[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Drama className="h-5 w-5 text-fuchsia-400" aria-hidden="true" />
            Character Sheet
          </DialogTitle>
          <DialogDescription>
            Upload a character photo to use as a reference. JPG, PNG or WEBP — up to 10 MB.
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
                  <img
                    src={img.storage_path}
                    alt={img.title ?? 'Character'}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    onClick={() => { void handleDelete(img.id) }}
                    aria-label="Delete character"
                    className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-zinc-200 opacity-0 transition hover:bg-rose-600 hover:text-white group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
