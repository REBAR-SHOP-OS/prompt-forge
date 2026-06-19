// Image Reframe dialog — upload an image, pick a target aspect ratio
// (9:16, 1:1, 16:9), and let Nano Banana convert it.
import { useCallback, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Crop, LoaderCircle, UploadCloud, Wand2, Download, RefreshCw } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/core/auth/AuthProvider'
import { useToast } from '@/hooks/use-toast'

const RATIOS = [
  { value: '9:16', label: '9:16', hint: 'Reels', cls: 'aspect-[9/16]' },
  { value: '1:1', label: '1:1', hint: 'Post', cls: 'aspect-square' },
  { value: '16:9', label: '16:9', hint: 'YouTube', cls: 'aspect-video' },
] as const

type Ratio = (typeof RATIOS)[number]['value']

const PROJECT_ID = 'sacxoanuyetjfrfllkzx'
const FUNCTIONS_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUseAsStartFrame?: (publicUrl: string, aspectRatio: Ratio) => void
}

export default function ImageReframeDialog({ open, onOpenChange, onUseAsStartFrame }: Props) {
  const { user } = useAuth()
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [ratio, setRatio] = useState<Ratio>('9:16')
  const [loading, setLoading] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setFile(null)
    setPreviewUrl(null)
    setResultUrl(null)
    setError(null)
    setLoading(false)
  }, [])

  function handleSelect(f: File | null) {
    setError(null)
    setResultUrl(null)
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setError('Please select an image file (jpg, png, or webp).')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('Image is larger than 10MB.')
      return
    }
    setFile(f)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(f))
  }

  async function handleConvert() {
    if (!file || !user?.id) return
    setLoading(true)
    setError(null)
    setResultUrl(null)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace('jpeg', 'jpg')
      const inputPath = `${user.id}/reframe-input-${Date.now()}-${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage
        .from('user-images')
        .upload(inputPath, file, { contentType: file.type, upsert: false })
      if (up.error) throw new Error(up.error.message)
      // user-images is a PRIVATE bucket — hand the server a signed URL it can fetch.
      const { data: signed, error: signErr } = await supabase.storage
        .from('user-images')
        .createSignedUrl(inputPath, 60 * 60 * 6)
      if (signErr || !signed?.signedUrl) throw new Error(signErr?.message || 'Could not sign image')

      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      if (!token) throw new Error('You are signed out. Please sign in again.')

      const resp = await fetch(`${FUNCTIONS_BASE}/image-reframe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl: signed.signedUrl, aspectRatio: ratio }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        throw new Error(json?.error || `Request failed (${resp.status})`)
      }
      setResultUrl(json.publicUrl as string)
      toast({ title: 'Image reframed', description: `Converted to ${ratio}` })
    } catch (e) {
      const msg = (e as Error).message || 'Something went wrong.'
      setError(msg)
      toast({ title: 'Reframe failed', description: msg, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload() {
    if (!resultUrl) return
    try {
      const res = await fetch(resultUrl)
      const blob = await res.blob()
      const a = document.createElement('a')
      const objUrl = URL.createObjectURL(blob)
      a.href = objUrl
      a.download = `reframed-${ratio.replace(':', 'x')}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objUrl)
    } catch {
      window.open(resultUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="h-4 w-4" /> Reframe image
          </DialogTitle>
          <DialogDescription>
            Upload an image, pick a target aspect ratio, and Nano Banana will reframe it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handleSelect(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-white/15 bg-white/[0.03] px-4 py-6 text-sm text-zinc-300 transition hover:border-white/30 hover:bg-white/[0.06]"
            >
              <UploadCloud className="h-4 w-4" />
              {file ? `Selected: ${file.name}` : 'Click to upload an image (jpg, png, webp — max 10MB)'}
            </button>
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-zinc-400">Target aspect ratio</div>
            <div role="radiogroup" className="inline-flex rounded-full border border-white/10 bg-black/20 p-1 text-xs font-semibold">
              {RATIOS.map((opt) => {
                const active = ratio === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setRatio(opt.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                      active ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-zinc-500">{opt.hint}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-zinc-500">Original</div>
              <div className={`flex items-center justify-center overflow-hidden rounded-md border border-white/10 bg-black/40 ${RATIOS.find((r) => r.value === ratio)?.cls}`}>
                {previewUrl ? (
                  <img src={previewUrl} alt="Original" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-zinc-600">No image yet</span>
                )}
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-zinc-500">Reframed ({ratio})</span>
                {file ? (
                  <button
                    type="button"
                    onClick={handleConvert}
                    disabled={loading}
                    title="Regenerate"
                    aria-label="Regenerate"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                ) : null}
              </div>
              <div className={`flex items-center justify-center overflow-hidden rounded-md border border-white/10 bg-black/40 ${RATIOS.find((r) => r.value === ratio)?.cls}`}>
                {loading ? (
                  <LoaderCircle className="h-6 w-6 animate-spin text-zinc-400" />
                ) : resultUrl ? (
                  <img src={resultUrl} alt="Reframed" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-zinc-600">Click Convert to generate</span>
                )}
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              Close
            </Button>
            {resultUrl ? (
              <>
                <Button variant="secondary" onClick={handleDownload} disabled={loading}>
                  <Download className="mr-1.5 h-4 w-4" /> Download
                </Button>
                {onUseAsStartFrame ? (
                  <Button
                    onClick={() => {
                      onUseAsStartFrame(resultUrl, ratio)
                      onOpenChange(false)
                    }}
                  >
                    Use as Start frame
                  </Button>
                ) : null}
              </>
            ) : (
              <Button onClick={handleConvert} disabled={!file || loading}>
                {loading ? (
                  <>
                    <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> Converting…
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-1.5 h-4 w-4" /> Convert with Nano Banana
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
