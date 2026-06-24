import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Check, Download, Languages, LoaderCircle, Mic, Play, RefreshCw, ShieldCheck, ShoppingBag, Sparkles, X } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  SoundtrackWaveform,
  type SoundtrackWaveformHandle,
} from '@/modules/generator-ui/components/SoundtrackWaveform'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  VOICE_CATALOG,
  defaultVoiceForGender,
  getVoiceById,
  voicesForGender,
  type VoiceGender,
} from '@/modules/generator-ui/lib/voiceCatalog'

type Gender = VoiceGender
type Tone =
  | 'advertising'
  | 'excited'
  | 'calm'
  | 'narrative'
  | 'friendly'
  | 'serious'
  | 'dramatic'
  | 'whisper'
  | 'news'
  | 'storytelling'
  | 'cheerful'
  | 'sad'
  | 'angry'

const TONE_LABELS: { value: Tone; label: string }[] = [
  { value: 'advertising', label: 'Advertising' },
  { value: 'excited', label: 'Excited' },
  { value: 'calm', label: 'Calm' },
  { value: 'narrative', label: 'Narrative' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'serious', label: 'Serious' },
  { value: 'dramatic', label: 'Dramatic' },
  { value: 'whisper', label: 'Whisper / Soft' },
  { value: 'news', label: 'News Anchor' },
  { value: 'storytelling', label: 'Storytelling' },
  { value: 'cheerful', label: 'Cheerful' },
  { value: 'sad', label: 'Sad / Emotional' },
  { value: 'angry', label: 'Angry / Intense' },
]

interface VoiceoverDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUseAsSoundtrack?: (url: string, name: string) => void
  /** Uploaded products available for advertising-narration generation. */
  products?: { id: string; name: string; imageUrl?: string }[]
  // Active voiceover applied to the film + its timing/volume controls.
  activeVoiceoverUrl?: string | null
  activeVoiceoverName?: string | null
  voiceoverVolume?: number
  onVoiceoverVolumeChange?: (v: number) => void
  voiceoverRange?: [number, number]
  onVoiceoverRangeChange?: (r: [number, number]) => void
  voiceoverTimeline?: [number, number]
  onVoiceoverTimelineChange?: (r: [number, number]) => void
  voiceoverDuration?: number
  onVoiceoverDurationChange?: (d: number) => void
  mergedDurationSec?: number
  waveformRef?: MutableRefObject<SoundtrackWaveformHandle | null>
  onClearVoiceover?: () => void
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function formatTimeMS(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${m}:${ss.toString().padStart(2, '0')}`
}

// Supported translation targets (must match the translate-text edge function).
const TRANSLATE_LANGS: { code: string; label: string }[] = [
  { code: 'fa', label: 'فارسی' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ru', label: 'Русский' },
  { code: 'zh', label: '中文' },
]

// Result of the deterministic + speech-level audio health check.
type AudioCheckStatus = 'ok' | 'warn' | 'error'
interface AudioCheckResult {
  status: AudioCheckStatus
  summary: string
  issues: string[]
}

// Word returned by the video-transcript STT edge function.
interface TranscriptWord {
  text: string
  confidence: number
  lowConfidence: boolean
}

// Normalize text into comparable lowercase word tokens (drops punctuation).
function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}






export function VoiceoverDialog({
  open,
  onOpenChange,
  onUseAsSoundtrack,
  products = [],
  activeVoiceoverUrl,
  activeVoiceoverName,
  voiceoverVolume = 1,
  onVoiceoverVolumeChange,
  voiceoverRange = [0, 0],
  onVoiceoverRangeChange,
  voiceoverTimeline = [0, 0],
  onVoiceoverTimelineChange,
  voiceoverDuration = 0,
  onVoiceoverDurationChange,
  mergedDurationSec = 0,
  waveformRef,
  onClearVoiceover,
}: VoiceoverDialogProps) {
  const [text, setText] = useState('')
  const [gender, setGender] = useState<Gender>('female')
  const [voiceId, setVoiceId] = useState<string>(() => defaultVoiceForGender('female').id)
  const [tone, setTone] = useState<Tone>('advertising')
  const [isAutoDuration, setIsAutoDuration] = useState<boolean>(true)
  const [customDuration, setCustomDuration] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<AudioCheckResult | null>(null)
  const [checkOpen, setCheckOpen] = useState(false)
  const [playingSampleId, setPlayingSampleId] = useState<string | null>(null)

  // --- Product advertising-narration generator ---
  const [isProductPopoverOpen, setIsProductPopoverOpen] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [narrationSeconds, setNarrationSeconds] = useState<string>('15')
  const [isWritingNarration, setIsWritingNarration] = useState(false)
  // Remember the last successful narration request so it can be regenerated.
  const [lastNarration, setLastNarration] = useState<{ productId: string; seconds: number } | null>(null)

  async function runNarration(productId: string | null, secs: number) {
    const product = products.find((p) => p.id === productId)
    if (!product) {
      toast.error('Please choose a product first.')
      return
    }
    if (!Number.isFinite(secs) || secs < 1 || secs > 600) {
      toast.error('Enter a duration between 1 and 600 seconds.')
      return
    }
    setIsWritingNarration(true)
    try {
      // Load the user's saved company/brand info so the narration can close
      // with a short promotional line about the company.
      let businessInfo = ''
      let narrationInstructions = ''
      try {
        const { data: authData } = await supabase.auth.getUser()
        const uid = authData?.user?.id
        if (uid) {
          const { data: profile } = await supabase
            .from('generator_business_profiles')
            .select('business_info, narration_instructions')
            .eq('user_id', uid)
            .maybeSingle()
          businessInfo = (profile?.business_info ?? '').trim()
          narrationInstructions = ((profile as { narration_instructions?: string | null })?.narration_instructions ?? '').trim()
        }
      } catch {
        // Non-fatal: fall back to product-only narration.
      }
      const { data, error } = await supabase.functions.invoke('ad-narration', {
        body: { productName: product.name, durationSec: secs, businessInfo, narrationInstructions },
      })
      if (error) throw error
      const narration: string | undefined = data?.narration
      if (!narration) throw new Error(data?.error || 'No narration returned')
      setText(narration)
      // A fresh narration invalidates any previous translation reference.
      setTranslation(null)
      setTranslationLang(null)
      // Narration is always advertising copy — keep the TTS tone aligned.
      setTone('advertising')
      setLastNarration({ productId: product.id, seconds: secs })
      setIsProductPopoverOpen(false)
      toast.success('Advertising narration generated.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate narration.'
      toast.error(msg)
    } finally {
      setIsWritingNarration(false)
    }
  }

  function handleGenerateNarration() {
    void runNarration(selectedProductId, Math.round(Number(narrationSeconds)))
  }

  function handleRegenerateNarration() {
    if (!lastNarration) return
    void runNarration(lastNarration.productId, lastNarration.seconds)
  }

  // --- Narration translation (reference only — never overwrites the original) ---
  const [isTranslateOpen, setIsTranslateOpen] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [translation, setTranslation] = useState<string | null>(null)
  const [translationLang, setTranslationLang] = useState<string | null>(null)

  async function handleTranslate(targetLang: string) {
    const source = text.trim()
    if (!source) {
      toast.error('Please write some text first.')
      return
    }
    setIsTranslating(true)
    try {
      const { data, error } = await supabase.functions.invoke('translate-text', {
        body: { text: source, targetLang, style: 'advertising' },
      })
      if (error) throw error
      const translationResult: string | undefined = data?.translation
      if (!translationResult) throw new Error(data?.error || 'No translation returned')
      // Keep the original text intact — the translation is shown only for reference.
      setTranslation(translationResult)
      setTranslationLang(
        TRANSLATE_LANGS.find((l) => l.code === targetLang)?.label ?? targetLang,
      )
      setIsTranslateOpen(false)
      toast.success('Narration translated.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to translate narration.'
      toast.error(msg)
    } finally {
      setIsTranslating(false)
    }
  }





  const lastUrlRef = useRef<string | null>(null)
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null)

  const currentVoice = getVoiceById(voiceId) ?? defaultVoiceForGender(gender)

  function handleGenderChange(next: Gender) {
    setGender(next)
    // Reset the selected voice to the first voice of the new gender group.
    setVoiceId(defaultVoiceForGender(next).id)
  }

  function playSample(id: string) {
    const voice = getVoiceById(id)
    if (!voice) return
    let el = sampleAudioRef.current
    if (!el) {
      el = new Audio()
      sampleAudioRef.current = el
      el.addEventListener('ended', () => setPlayingSampleId(null))
    }
    // Toggle: clicking the currently-playing sample stops it.
    if (playingSampleId === id && !el.paused) {
      el.pause()
      el.currentTime = 0
      setPlayingSampleId(null)
      return
    }
    el.pause()
    el.src = voice.sampleUrl
    el.currentTime = 0
    setPlayingSampleId(id)
    void el.play().catch(() => setPlayingSampleId(null))
  }

  function resolveDurationSec(): number | undefined {
    if (isAutoDuration) return undefined
    const n = Math.round(Number(customDuration))
    if (Number.isFinite(n) && n >= 1 && n <= 135) return n
    return undefined
  }

  // Cleanup blob URLs we created (not the one handed off to the parent).
  useEffect(() => {
    return () => {
      if (lastUrlRef.current) {
        try { URL.revokeObjectURL(lastUrlRef.current) } catch { /* ignore */ }
      }
      if (sampleAudioRef.current) {
        try { sampleAudioRef.current.pause() } catch { /* ignore */ }
      }
    }
  }, [])

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setIsGenerating(false)
      if (sampleAudioRef.current) {
        try { sampleAudioRef.current.pause() } catch { /* ignore */ }
      }
      setPlayingSampleId(null)
    }
  }, [open])

  async function persistVoiceover(blob: Blob) {
    try {
      const { data: userRes } = await supabase.auth.getUser()
      const uid = userRes.user?.id
      if (!uid) return
      const type = (blob.type || '').toLowerCase()
      const ext = type.includes('mpeg') || type.includes('mp3') ? 'mp3'
        : type.includes('ogg') ? 'ogg'
        : type.includes('webm') ? 'webm'
        : type.includes('m4a') || type.includes('mp4') ? 'm4a'
        : 'wav'
      const path = `${uid}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('user-audio')
        .upload(path, blob, { contentType: blob.type || 'audio/wav', upsert: false })
      if (upErr) throw upErr
      await supabase.from('generator_user_audio').insert({
        user_id: uid,
        storage_path: path,
        kind: 'voiceover',
        name: `Voiceover (${currentVoice.label}, ${tone})`,
        size_bytes: blob.size,
        mime_type: blob.type || null,
      })
    } catch (err) {
      console.error('Failed to save voiceover to storage', err)
    }
  }

  async function handleGenerate() {



    const trimmed = text.trim()
    if (!trimmed) {
      toast.error('Please write some text first')
      return
    }
    setIsGenerating(true)
    try {
      const durationSec = resolveDurationSec()
      const { data, error } = await supabase.functions.invoke('tts-generate', {
        body: { text: trimmed, gender, tone, voiceName: currentVoice.voiceName, ...(durationSec ? { durationSec } : {}) },
      })
      if (error) throw error
      const payload = data as {
        audioBase64?: string
        mimeType?: string
        error?: string
        warning?: string
      } | null
      if (!payload?.audioBase64) {
        throw new Error(payload?.error || 'No audio returned')
      }
      const blob = base64ToBlob(payload.audioBase64, payload.mimeType || 'audio/wav')
      // Revoke previous local URL
      if (lastUrlRef.current) {
        try { URL.revokeObjectURL(lastUrlRef.current) } catch { /* ignore */ }
      }
      const url = URL.createObjectURL(blob)
      lastUrlRef.current = url
      setAudioUrl(url)
      if (payload.warning) toast.warning(payload.warning)
      // Persist to Storage › Audio so every generated voiceover is saved.
      void persistVoiceover(blob)

      // Auto-apply: immediately surface the full settings panel (volume,
      // waveform selection, "Play on video from … to") for the new voiceover.
      if (onUseAsSoundtrack) {
        const name = `Voiceover (${currentVoice.label} · ${tone}).wav`
        onUseAsSoundtrack(url, name)
        // Ownership handed off to the parent — don't revoke it here.
        lastUrlRef.current = null
      }


    } catch (err) {
      console.error('Voiceover generation failed', err)
      toast.error(
        err instanceof Error
          ? `Voiceover failed: ${err.message}`
          : 'Voiceover failed',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleCheckAudio() {
    const checkUrl = activeVoiceoverUrl ?? audioUrl
    if (!checkUrl) {
      toast.error('No voiceover to check yet.')
      return
    }
    setChecking(true)
    try {
      const res = await fetch(checkUrl)
      const arrayBuffer = await res.arrayBuffer()
      if (!arrayBuffer.byteLength) throw new Error('empty')

      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      let audioBuffer: AudioBuffer
      try {
        audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
      } finally {
        void ctx.close().catch(() => { /* ignore */ })
      }

      if (!audioBuffer || audioBuffer.duration <= 0) {
        toast.error('فایل صدا خراب است یا مدت‌زمان معتبری ندارد.')
        return
      }

      let sumSquares = 0
      let total = 0
      let clipped = 0
      let invalid = false
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const data = audioBuffer.getChannelData(ch)
        for (let i = 0; i < data.length; i++) {
          const s = data[i]
          if (!Number.isFinite(s)) { invalid = true; break }
          const abs = Math.abs(s)
          sumSquares += s * s
          if (abs >= 0.99) clipped++
          total++
        }
        if (invalid) break
      }

      if (invalid) {
        toast.error('صدا حاوی داده‌ی نامعتبر است (خراب).')
        return
      }

      const rms = total > 0 ? Math.sqrt(sumSquares / total) : 0
      const clipRatio = total > 0 ? clipped / total : 0

      if (rms < 0.0005) {
        toast.error('صدا سکوت کامل است — هیچ گفتاری تولید نشده.')
        return
      }
      if (clipRatio > 0.01) {
        toast.warning(`صدا اعوجاج/کلیپینگ دارد (${Math.round(clipRatio * 100)}٪ از نمونه‌ها اشباع).`)
        return
      }

      toast.success(`صدا سالم است ✓ (مدت: ${formatTimeMS(audioBuffer.duration)})`)
    } catch (err) {
      console.error('Audio check failed', err)
      toast.error('فایل صدا قابل خواندن نیست یا خراب است.')
    } finally {
      setChecking(false)
    }
  }

  function handleDownload() {
    const downloadUrl = activeVoiceoverUrl ?? audioUrl
    if (!downloadUrl) return
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = `voiceover-${currentVoice.label}-${tone}-${Date.now()}.wav`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-black text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-4 w-4" aria-hidden="true" />
            Voiceover
          </DialogTitle>
          <DialogDescription>
            Type your text, choose a voice and tone, then generate a spoken
            voiceover with AI Studio (Gemini).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vo-text" className="text-xs uppercase tracking-wider text-zinc-400">
              Text
            </Label>
            <Textarea
              id="vo-text"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                // Editing the original invalidates the translation reference.
                if (translation) {
                  setTranslation(null)
                  setTranslationLang(null)
                }
              }}
              placeholder="What should the voice say?"
              rows={5}
              maxLength={5000}
              className="resize-none border-white/10 bg-white/[0.04] text-zinc-100 placeholder:text-zinc-500"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
              <Popover open={isProductPopoverOpen} onOpenChange={setIsProductPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title="Write an advertising narration from one of your products"
                    aria-label="Generate advertising narration from a product"
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
                    Product narration
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-80 border-white/10 bg-black text-zinc-100"
                >
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">Product narration</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">
                        Pick a product and a duration to auto-write an English
                        advertising narration.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wider text-zinc-400">
                        Product
                      </Label>
                      {products.length === 0 ? (
                        <p className="rounded-md border border-dashed border-white/10 px-2 py-3 text-center text-[11px] text-zinc-500">
                          No saved products yet.
                        </p>
                      ) : (
                        <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto pr-1">
                          {products.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedProductId(p.id)}
                              title={p.name}
                              className={`group relative flex flex-col gap-1 rounded-lg border p-1 text-left transition ${
                                selectedProductId === p.id
                                  ? 'border-emerald-300/60 bg-emerald-300/10'
                                  : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                              }`}
                            >
                              <span className="relative block aspect-square w-full overflow-hidden rounded-md border border-white/10 bg-[#15171a]">
                                {p.imageUrl ? (
                                  <img
                                    src={p.imageUrl}
                                    alt={p.name}
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="grid h-full w-full place-items-center">
                                    <ShoppingBag className="h-4 w-4 text-zinc-600" aria-hidden="true" />
                                  </span>
                                )}
                                {selectedProductId === p.id ? (
                                  <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-emerald-400 text-black">
                                    <Check className="h-3 w-3" aria-hidden="true" />
                                  </span>
                                ) : null}
                              </span>
                              <span
                                className={`truncate text-[10px] ${
                                  selectedProductId === p.id ? 'text-emerald-100' : 'text-zinc-400'
                                }`}
                              >
                                {p.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="vo-narration-seconds"
                        className="text-[10px] uppercase tracking-wider text-zinc-400"
                      >
                        Duration (seconds)
                      </Label>
                      <Input
                        id="vo-narration-seconds"
                        type="number"
                        min={1}
                        max={600}
                        value={narrationSeconds}
                        onChange={(e) => setNarrationSeconds(e.target.value)}
                        placeholder="e.g. 15"
                        className="h-8 border-white/10 bg-white/[0.04] text-zinc-100 placeholder:text-zinc-500"
                      />
                    </div>

                    <Button
                      type="button"
                      onClick={() => handleGenerateNarration()}
                      disabled={
                        isWritingNarration ||
                        !selectedProductId ||
                        products.length === 0
                      }
                      className="w-full gap-2"
                    >
                      {isWritingNarration ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                      )}
                      Generate narration
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              {lastNarration ? (
                <button
                  type="button"
                  onClick={handleRegenerateNarration}
                  disabled={isWritingNarration}
                  title="Regenerate narration"
                  aria-label="Regenerate narration"
                  className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isWritingNarration ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              ) : null}
              <Popover open={isTranslateOpen} onOpenChange={setIsTranslateOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={isTranslating || !text.trim()}
                    title="Translate narration"
                    aria-label="Translate narration"
                    className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-sky-300/40 hover:bg-sky-300/10 hover:text-sky-200 disabled:opacity-50"
                  >
                    {isTranslating ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Languages className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-44 p-1.5">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    Translate to
                  </p>
                  <div className="max-h-56 overflow-y-auto">
                    {TRANSLATE_LANGS.map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        disabled={isTranslating}
                        onClick={() => void handleTranslate(l.code)}
                        className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-zinc-200 transition hover:bg-white/[0.06] disabled:opacity-50"
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              </div>
              <div className="text-right text-[10px] uppercase tracking-wider text-zinc-500">
                {text.length}/5000
              </div>
            </div>

            {translation ? (
              <div className="space-y-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Translation{translationLang ? ` (${translationLang})` : ''} — reference only
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setTranslation(null)
                      setTranslationLang(null)
                    }}
                    title="Dismiss translation"
                    aria-label="Dismiss translation"
                    className="grid h-5 w-5 place-items-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
                <p className="whitespace-pre-wrap text-[12px] leading-5 text-zinc-300">
                  {translation}
                </p>
              </div>
            ) : null}

          </div>


          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                Gender
              </Label>
              <Select value={gender} onValueChange={(v) => handleGenderChange(v as Gender)}>
                <SelectTrigger className="border-white/10 bg-white/[0.04] text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="child">Child</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                Tone
              </Label>
              <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                <SelectTrigger className="border-white/10 bg-white/[0.04] text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_LABELS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-zinc-400">
                Voice / Character
              </Label>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                Tap ▶ to preview
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Select value={voiceId} onValueChange={(v) => setVoiceId(v)}>
                <SelectTrigger className="flex-1 border-white/10 bg-white/[0.04] text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {voicesForGender(gender).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <span className="flex items-center gap-2">
                        <span>{v.label}</span>
                        <span className="text-[11px] text-zinc-500">· {v.personality}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Play sample of ${currentVoice.label}`}
                onClick={() => playSample(currentVoice.id)}
                className="shrink-0 border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/10"
              >
                {playingSampleId === currentVoice.id ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[11px] leading-snug text-zinc-500">
              {currentVoice.label} — {currentVoice.personality.toLowerCase()}.
            </p>
          </div>


          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-zinc-400">
              Duration
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid grid-cols-2 gap-1 rounded-md border border-white/10 bg-white/[0.04] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsAutoDuration(true)
                    setCustomDuration('')
                  }}
                  className={`rounded px-3 py-1.5 text-sm transition-colors ${
                    isAutoDuration
                      ? 'bg-white/10 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => setIsAutoDuration(false)}
                  className={`rounded px-3 py-1.5 text-sm transition-colors ${
                    !isAutoDuration
                      ? 'bg-white/10 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Manual
                </button>
              </div>

              <Input
                type="number"
                min={1}
                max={135}
                value={isAutoDuration ? '' : customDuration}
                disabled={isAutoDuration}
                onChange={(e) => {
                  setIsAutoDuration(false)
                  setCustomDuration(e.target.value)
                }}
                placeholder={isAutoDuration ? 'Auto' : 'Seconds (1–135)'}
                className="border-white/10 bg-white/[0.04] text-zinc-100 placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <p className="text-[11px] leading-snug text-zinc-500">
              {isAutoDuration
                ? 'Voice is paced and fitted automatically to the content.'
                : 'Voice is paced and fitted to the chosen length (1–135 seconds).'}
            </p>
          </div>



          <Button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !text.trim()}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate voiceover
              </>
            )}
          </Button>



          {activeVoiceoverUrl ? (
            <div className="space-y-4 rounded-md border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2 text-xs text-zinc-300">
                  <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{activeVoiceoverName ?? 'Voiceover'}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={handleCheckAudio}
                    disabled={checking}
                    aria-label="Check audio for errors"
                    title="بررسی سلامت صدا"
                    className="grid h-6 w-6 place-items-center rounded-full text-emerald-400 hover:bg-emerald-400/10 hover:text-emerald-300 disabled:opacity-50"
                  >
                    {checking ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                  {onClearVoiceover ? (
                    <button
                      type="button"
                      onClick={onClearVoiceover}
                      aria-label="Remove voiceover"
                      className="grid h-6 w-6 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Voiceover volume</span>
                  <span className="tabular-nums text-zinc-200">{Math.round(voiceoverVolume * 100)}%</span>
                </div>
                <Slider
                  value={[Math.round(voiceoverVolume * 100)]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => onVoiceoverVolumeChange?.((v[0] ?? 0) / 100)}
                />
              </div>

              <SoundtrackWaveform
                ref={waveformRef}
                url={activeVoiceoverUrl}
                range={voiceoverRange[1] > voiceoverRange[0] ? voiceoverRange : [0, Math.max(0.1, voiceoverDuration)]}
                onReady={(d) => {
                  onVoiceoverDurationChange?.(d)
                  if (voiceoverRange[1] <= voiceoverRange[0]) onVoiceoverRangeChange?.([0, d])
                }}
                onRangeChange={(r) => { if (r[1] > r[0]) onVoiceoverRangeChange?.([r[0], r[1]]) }}
              />

              <div className="space-y-3 rounded-md border border-white/10 bg-black/40 p-3">
                <div className="flex items-center justify-between text-xs text-zinc-300">
                  <span className="font-medium">Play on video from … to</span>
                  <span className="tabular-nums text-zinc-200">
                    {formatTimeMS(voiceoverTimeline[0])} – {formatTimeMS(voiceoverTimeline[1] > voiceoverTimeline[0] ? voiceoverTimeline[1] : mergedDurationSec)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>Start</span>
                    <span className="tabular-nums text-zinc-200">{formatTimeMS(voiceoverTimeline[0])}</span>
                  </div>
                  <Slider
                    value={[Math.round(voiceoverTimeline[0])]}
                    min={0}
                    max={mergedDurationSec}
                    step={1}
                    onValueChange={(v) => {
                      const s = Math.min(v[0] ?? 0, (voiceoverTimeline[1] || mergedDurationSec) - 1)
                      onVoiceoverTimelineChange?.([Math.max(0, s), voiceoverTimeline[1] || mergedDurationSec])
                    }}
                  />
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>End</span>
                    <span className="tabular-nums text-zinc-200">{formatTimeMS(voiceoverTimeline[1] > voiceoverTimeline[0] ? voiceoverTimeline[1] : mergedDurationSec)}</span>
                  </div>
                  <Slider
                    value={[Math.round(voiceoverTimeline[1] > voiceoverTimeline[0] ? voiceoverTimeline[1] : mergedDurationSec)]}
                    min={0}
                    max={mergedDurationSec}
                    step={1}
                    onValueChange={(v) => {
                      const e = Math.max(v[0] ?? mergedDurationSec, voiceoverTimeline[0] + 1)
                      onVoiceoverTimelineChange?.([voiceoverTimeline[0], Math.min(mergedDurationSec, e)])
                    }}
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Outside this window the voiceover is silent. Total film ≈ {formatTimeMS(mergedDurationSec)}.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleDownload}
            disabled={!activeVoiceoverUrl && !audioUrl}
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={!activeVoiceoverUrl && !audioUrl}
          >
            <Check className="mr-2 h-4 w-4" />
            Apply
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
