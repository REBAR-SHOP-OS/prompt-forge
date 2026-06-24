import { useEffect, useState } from 'react'
import { Building2, LoaderCircle, Check, ImagePlus } from 'lucide-react'
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
import { supabase } from '@/integrations/supabase/client'

interface BusinessProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string | null
  /** Called after a successful save with whether business info is now filled. */
  onSaved?: (hasBusinessInfo: boolean) => void
}

/**
 * Standalone "About your business" editor, reachable from the main app top bar.
 * Edits the single per-user row in `generator_business_profiles`, including the
 * narration instructions that steer the advertising voiceover tone/style.
 */
export function BusinessProfileDialog({ open, onOpenChange, userId, onSaved }: BusinessProfileDialogProps) {
  const [businessInfo, setBusinessInfo] = useState('')
  const [narrationInstructions, setNarrationInstructions] = useState('')
  const [contactWebsite, setContactWebsite] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactAddress, setContactAddress] = useState('')
  const [contactLogo, setContactLogo] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (open && userId) {
      setLoading(true)
      supabase
        .from('generator_business_profiles')
        .select('business_info, narration_instructions, contact_website, contact_phone, contact_address, contact_logo_url')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return
          setBusinessInfo(data?.business_info ?? '')
          setNarrationInstructions((data as { narration_instructions?: string | null })?.narration_instructions ?? '')
          setContactWebsite(data?.contact_website ?? '')
          setContactPhone(data?.contact_phone ?? '')
          setContactAddress(data?.contact_address ?? '')
          setContactLogo((data as { contact_logo_url?: string | null })?.contact_logo_url ?? '')
          setLoading(false)
        })
    }
    return () => {
      cancelled = true
    }
  }, [open, userId])

  function onContactLogoFile(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new window.Image()
      img.onload = () => {
        const max = 256
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, w, h)
        setContactLogo(canvas.toDataURL('image/png'))
        setSaved(false)
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  async function save() {
    if (!businessInfo.trim()) {
      setError('Please describe your business first.')
      return
    }
    if (!userId) return
    setSaving(true)
    setSaved(false)
    try {
      const { error: upErr } = await supabase
        .from('generator_business_profiles')
        .upsert({
          user_id: userId,
          business_info: businessInfo.trim(),
          narration_instructions: narrationInstructions.trim() || null,
          contact_website: contactWebsite.trim() || null,
          contact_phone: contactPhone.trim() || null,
          contact_address: contactAddress.trim() || null,
          contact_logo_url: contactLogo || null,
        }, { onConflict: 'user_id' })
      if (upErr) {
        setError(upErr.message)
        return
      }
      setSaved(true)
      setError(null)
      onSaved?.(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-white/10 bg-[#0b0c0e]/95 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-300" aria-hidden="true" />
            About your business <span className="text-amber-300 text-sm font-normal">(required)</span>
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Tell us about your business and how the narration should sound. This is used to keep every
            generated ad relevant and to close the voiceover with a short promo for your brand.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-300">
              About your business <span className="text-amber-300">(required)</span>
            </div>
            <Textarea
              value={businessInfo}
              onChange={(e) => { setBusinessInfo(e.target.value); setSaved(false); if (error) setError(null) }}
              rows={6}
              placeholder="Describe your business: what you sell, your products/services, target audience, and brand tone…"
              className="min-h-[140px] resize-y border-white/10 bg-black/30 text-sm text-zinc-100"
              disabled={loading}
            />
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-300">
              Narration instructions <span className="text-zinc-500">(optional)</span>
            </div>
            <Textarea
              value={narrationInstructions}
              onChange={(e) => { setNarrationInstructions(e.target.value); setSaved(false) }}
              rows={4}
              placeholder="How should the voiceover sound? e.g. formal and confident tone, emphasize quality and trust, speak slowly, mention our brand name warmly…"
              className="min-h-[100px] resize-y border-white/10 bg-black/30 text-sm text-zinc-100"
              disabled={loading}
            />
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-300">
              Contact details (shown on video)
            </div>
            <div className="space-y-2">
              <Input
                value={contactWebsite}
                onChange={(e) => { setContactWebsite(e.target.value); setSaved(false) }}
                placeholder="Website"
                className="h-9 border-white/10 bg-black/30 text-sm text-zinc-100"
                disabled={loading}
              />
              <Input
                value={contactPhone}
                onChange={(e) => { setContactPhone(e.target.value); setSaved(false) }}
                placeholder="Phone"
                className="h-9 border-white/10 bg-black/30 text-sm text-zinc-100"
                disabled={loading}
              />
              <Input
                value={contactAddress}
                onChange={(e) => { setContactAddress(e.target.value); setSaved(false) }}
                placeholder="Address"
                className="h-9 border-white/10 bg-black/30 text-sm text-zinc-100"
                disabled={loading}
              />
              <div className="flex items-center gap-2 pt-1">
                {contactLogo ? (
                  <img
                    src={contactLogo}
                    alt="Company logo"
                    className="h-10 w-10 rounded-md border border-white/15 bg-white/5 object-contain p-0.5"
                  />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-md border border-dashed border-white/15 bg-black/30 text-zinc-500">
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  </div>
                )}
                <label className="cursor-pointer rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/30">
                  {contactLogo ? 'Replace' : 'Company logo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { onContactLogoFile(e.target.files?.[0]); e.currentTarget.value = '' }}
                  />
                </label>
                {contactLogo ? (
                  <button
                    type="button"
                    onClick={() => { setContactLogo(''); setSaved(false) }}
                    className="text-[11px] text-zinc-400 transition hover:text-rose-300"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving || loading || !businessInfo.trim()}>
            {saving ? (
              <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            ) : saved ? (
              <Check className="h-4 w-4 mr-2" aria-hidden="true" />
            ) : null}
            {saved ? 'Saved' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
