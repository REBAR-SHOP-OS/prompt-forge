import { useEffect, useRef, useState } from 'react'
import { Clapperboard, LoaderCircle, RefreshCw, Copy, Check, Wand2, Send, ImagePlus, X, Building2, Languages } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/integrations/supabase/client'
import { safeMediaUrl } from '@/modules/generator-ui/lib/safeMediaUrl'

type Lang = 'en'
const RTL_LANGS: Lang[] = []

// Localized narration labels the edge function may emit, used to split a scene
// block into its visual scenario part and its narration part.
const NARRATION_LABELS = ['Narration', 'نریشن', 'التعليق الصوتي', 'Anlatım', 'Narración']
const NARRATION_RE = new RegExp(`(^|\\n)\\s*(${NARRATION_LABELS.join('|')})\\s*:\\s*`, 'i')

function splitNarration(text: string): { body: string; narration: string | null } {
  const m = text.match(NARRATION_RE)
  if (!m || m.index === undefined) return { body: text.trim(), narration: null }
  const labelStart = m.index + m[1].length
  const body = text.slice(0, labelStart).trim()
  const narration = text.slice(m.index + m[0].length).trim()
  return { body, narration: narration || null }
}

function SceneText({ text, narrationLabel, dir }: { text: string; narrationLabel: string; dir: string }) {
  const { body, narration } = splitNarration(text)
  return (
    <div className="space-y-2">
      <p dir={dir} className="whitespace-pre-wrap text-sm leading-6 text-foreground">
        {body}
      </p>
      {narration ? (
        <div className="rounded-md border border-accent-warm/30 bg-amber-400/5 px-2.5 py-2">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-warm/90">
            {narrationLabel}
          </div>
          <p dir={dir} className="whitespace-pre-wrap text-sm leading-6 text-accent-warm/90">
            {narration}
          </p>
        </div>
      ) : null}
    </div>
  )
}
const LANG_OPTIONS: { value: Lang; native: string }[] = [
  { value: 'en', native: 'English' },
]

const T: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Scenario Writer',
    description: 'Pick a duration, describe your idea (any language), and get a cinematic scenario tuned to that length. Optionally attach a reference image.',
    businessLabel: 'About your business',
    businessRequired: '(required)',
    businessPlaceholder: 'Describe your business: what you sell, your products/services, target audience, and brand tone…',
    businessSave: 'Save',
    businessSaved: 'Saved',
    duration: 'Duration',
    yourIdea: 'Your idea',
    autoFromImage: 'Auto from image',
    writeMyOwn: 'Write my own',
    ideaPlaceholderAuto: 'The scenario will be written automatically from the uploaded image…',
    ideaPlaceholder: 'Describe your idea (any language)…',
    attachImage: 'Attach a reference image',
    removeImage: 'Remove image',
    imageAttached: 'Image attached',
    scene: 'Scene',
    narration: 'Narration',
    scenario: 'Scenario',
    copy: 'Copy',
    copied: 'Copied',
    copyAll: 'Copy all',
    regenerate: 'Regenerate',
    sendAll: 'Send all to Pending',
    useAsPrompt: 'Use as prompt',
    writeScenario: 'Write scenario',
    errSignIn: 'Please sign in to attach an image.',
    errOnlyImages: 'Only image files are supported.',
    errTooLarge: 'Image too large (max 10MB).',
    errUploadFailed: 'Image upload failed',
    errBusiness: 'Please describe your business first — the scenario must be relevant to it.',
    errEmpty: 'Empty AI response',
    errFailedWrite: 'Failed to write scenario',
    errFailedSend: 'Failed to send to Pending',
  },





}

export type ScenarioDuration = 5 | 10 | 15 | 30 | 45 | 135

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDuration: ScenarioDuration
  userId: string | null
  onUseAsPrompt: (scenario: string, imageUrl?: string, duration?: ScenarioDuration) => void
  onSendScenes?: (scenes: string[], imageUrl?: string, duration?: ScenarioDuration) => void | Promise<void>

}

const DURATIONS: ScenarioDuration[] = [5, 10, 15, 30, 45, 135]
const SPLIT_DURATIONS = [30, 45, 135]
const sceneRange = (i: number) => `${i * 15}–${(i + 1) * 15}s`
const FRAMES_BUCKET = 'wan-frames'

export default function ScenarioWriterDialog({
  open,
  onOpenChange,
  defaultDuration,
  userId,
  onUseAsPrompt,
  onSendScenes,
}: Props) {
  const [duration, setDuration] = useState<ScenarioDuration>(defaultDuration)
  const [businessInfo, setBusinessInfo] = useState('')
  const [businessSaving, setBusinessSaving] = useState(false)
  const [businessSaved, setBusinessSaved] = useState(false)
  const [businessOpen, setBusinessOpen] = useState(false)
  const [idea, setIdea] = useState('')
  const [ideaMode, setIdeaMode] = useState<'manual' | 'auto'>('manual')
  const [isWriting, setIsWriting] = useState(false)
  const [scenes, setScenes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null) // -1 = "all"
  const [isSending, setIsSending] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [lang, setLang] = useState<Lang>('en')
  const t = T[lang]
  const dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr'
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setDuration(defaultDuration)
      setError(null)
    }
  }, [open, defaultDuration])

  useEffect(() => {
    let cancelled = false
    if (open && userId) {
      supabase
        .from('generator_business_profiles')
        .select('business_info')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && data?.business_info) setBusinessInfo(data.business_info)
        })
    }
    return () => {
      cancelled = true
    }
  }, [open, userId])

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  async function handlePickImage(file: File | undefined) {
    if (!file) return
    if (!userId) {
      setError(t.errSignIn)
      return
    }
    if (!file.type.startsWith('image/')) {
      setError(t.errOnlyImages)
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t.errTooLarge)
      return
    }
    setError(null)
    const localUrl = URL.createObjectURL(file)
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImagePreviewUrl(localUrl)
    setUploadedImageUrl(null)
    setIsUploadingImage(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const storagePath = `${userId}/scenario-ref-${Date.now()}-${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(FRAMES_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { data } = supabase.storage.from(FRAMES_BUCKET).getPublicUrl(storagePath)
      setUploadedImageUrl(data.publicUrl)
      // When an image is attached, default to auto-from-image mode.
      if (!idea.trim()) setIdeaMode('auto')
    } catch (e) {
      setError((e as Error).message ?? t.errUploadFailed)
      setImagePreviewUrl(null)
      setUploadedImageUrl(null)
    } finally {
      setIsUploadingImage(false)
    }
  }

  function clearImage() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImagePreviewUrl(null)
    setUploadedImageUrl(null)
    setIdeaMode('manual')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function saveBusinessInfo() {
    if (!businessInfo.trim()) {
      setError(t.errBusiness)
      return
    }
    if (!userId) return
    setBusinessSaving(true)
    setBusinessSaved(false)
    try {
      const { error: upErr } = await supabase
        .from('generator_business_profiles')
        .upsert({ user_id: userId, business_info: businessInfo.trim() }, { onConflict: 'user_id' })
      if (upErr) {
        setError(upErr.message)
        return
      }
      setBusinessSaved(true)
      setError(null)
      setTimeout(() => setBusinessSaved(false), 1500)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to save')
    } finally {
      setBusinessSaving(false)
    }
  }



  async function generate() {
    const isAuto = ideaMode === 'auto' && Boolean(uploadedImageUrl)
    if ((!isAuto && !idea.trim() && !uploadedImageUrl) || (isAuto && !uploadedImageUrl) || isWriting) return
    if (!businessInfo.trim()) {
      setError(t.errBusiness)
      return
    }
    if (userId) {
      setBusinessSaving(true)
      try {
        await supabase
          .from('generator_business_profiles')
          .upsert({ user_id: userId, business_info: businessInfo.trim() }, { onConflict: 'user_id' })
      } catch {
        /* non-fatal */
      } finally {
        setBusinessSaving(false)
      }
    }
    setIsWriting(true)
    setError(null)
    setScenes([])
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('scenario-write', {
        body: {
          idea: isAuto ? '' : (idea.trim() || 'Generate a scenario based on the attached reference image.'),
          businessInfo: businessInfo.trim(),
          outputLanguage: lang,
          durationSeconds: duration,
          imageUrl: uploadedImageUrl ?? undefined,
          autoFromImage: isAuto,
        },
      })
      if (invokeErr) {
        setError(invokeErr.message || t.errFailedWrite)
        return
      }
      const payload = data as { scenario?: string; scenes?: string[]; warning?: string } | null
      const list = (payload?.scenes ?? []).map((s) => s.trim()).filter(Boolean)
      if (list.length === 0) {
        setError(t.errEmpty)
        return
      }
      setScenes(list)
      if (payload?.warning) setError(payload.warning)
    } catch (e) {
      setError((e as Error).message ?? t.errFailedWrite)
    } finally {
      setIsWriting(false)
    }
  }

  async function copyText(text: string, idx: number) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(idx)
      setTimeout(() => setCopiedIndex((c) => (c === idx ? null : c)), 1500)
    } catch {
      /* noop */
    }
  }

  function handleUseAsPrompt() {
    if (scenes.length === 0) return
    onUseAsPrompt(scenes.join('\n\n'), uploadedImageUrl ?? undefined, duration)
    onOpenChange(false)
  }

  async function handleSendAll() {
    if (scenes.length < 2 || !onSendScenes || isSending) return
    setIsSending(true)
    setError(null)
    try {
      await onSendScenes(scenes, uploadedImageUrl ?? undefined, duration)
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message ?? t.errFailedSend)
    } finally {
      setIsSending(false)
    }
  }

  function reset() {
    setIdea('')
    setScenes([])
    setError(null)
    setCopiedIndex(null)
    setIsSending(false)
    clearImage()
    setIdeaMode('manual')
  }

  const isSplit = SPLIT_DURATIONS.includes(duration) && scenes.length > 1
  const concatenated = scenes.join('\n\n')
  const isAutoMode = ideaMode === 'auto' && Boolean(uploadedImageUrl)
  const canGenerate =
    Boolean(businessInfo.trim()) &&
    (isAutoMode ? Boolean(uploadedImageUrl) : idea.trim().length > 0 || Boolean(uploadedImageUrl)) &&
    !isUploadingImage

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent dir={dir} className="max-w-2xl border-border bg-card text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-accent-warm" aria-hidden="true" />
            {t.title}
            <div className="ms-auto flex items-center gap-2">
              <Popover open={businessOpen} onOpenChange={setBusinessOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={t.businessLabel}
                    title={t.businessLabel}
                    className={`relative inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
                      businessInfo.trim()
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                        : 'border-accent-warm/40 bg-accent-warm/10 text-accent-warm'
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {!businessInfo.trim() && (
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 border-border bg-card text-foreground">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/80">
                    {t.businessLabel} <span className="text-accent-warm">{t.businessRequired}</span>
                  </div>
                  <Textarea
                    value={businessInfo}
                    onChange={(e) => {
                      setBusinessInfo(e.target.value)
                      setBusinessSaved(false)
                      if (error) setError(null)
                    }}
                    rows={4}
                    placeholder={t.businessPlaceholder}
                    className="min-h-[96px] border-border bg-surface-2 text-sm text-foreground"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      onClick={saveBusinessInfo}
                      disabled={businessSaving || !businessInfo.trim()}
                    >
                      {businessSaving ? (
                        <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                      ) : businessSaved ? (
                        <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                      ) : null}
                      {businessSaved ? t.businessSaved : t.businessSave}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
                <SelectTrigger
                  className="h-7 w-auto gap-1.5 rounded-full border-border bg-muted/60 px-2.5 text-[11px] font-semibold text-foreground/80"
                  aria-label="Language"
                >
                  <Languages className="h-3.5 w-3.5 text-accent-cool" aria-hidden="true" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANG_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.native}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t.duration}
            </div>
            <div
              role="radiogroup"
              aria-label="Scenario duration"
              className="inline-flex rounded-full border border-border bg-muted/60 p-1 text-xs font-semibold"
            >
              {DURATIONS.map((sec) => {
                const active = duration === sec
                return (
                  <button
                    key={sec}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDuration(sec)}
                    className={`rounded-full px-3 py-1.5 transition ${
                      active
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground/90'
                    }`}
                  >
                    {sec}s
                  </button>
                )
              })}
            </div>
            {SPLIT_DURATIONS.includes(duration) ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Will be split into {duration / 15} sequential 15s scenes and sent as {duration / 15} cards.
              </p>
            ) : null}
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.yourIdea}
              </div>
              {uploadedImageUrl ? (
                <div
                  role="radiogroup"
                  aria-label="Idea mode"
                  className="inline-flex rounded-full border border-border bg-muted/60 p-0.5 text-[11px] font-semibold"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={ideaMode === 'auto'}
                    onClick={() => setIdeaMode('auto')}
                    className={`rounded-full px-2.5 py-1 transition ${
                      ideaMode === 'auto' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground/90'
                    }`}
                  >
                    {t.autoFromImage}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={ideaMode === 'manual'}
                    onClick={() => setIdeaMode('manual')}
                    className={`rounded-full px-2.5 py-1 transition ${
                      ideaMode === 'manual' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground/90'
                    }`}
                  >
                    {t.writeMyOwn}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="relative">
              <Textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                rows={4}
                disabled={isAutoMode}
                placeholder={
                  isAutoMode
                    ? t.ideaPlaceholderAuto
                    : t.ideaPlaceholder
                }
                className="min-h-[100px] border-border bg-surface-2 pb-12 text-foreground disabled:opacity-60"
              />
              <div className="absolute bottom-2 left-2 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePickImage(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  title={t.attachImage}
                  aria-label={t.attachImage}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-2/60 text-foreground/80 transition hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {isUploadingImage ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                {safeMediaUrl(imagePreviewUrl) ? (
                  <div className="relative">
                    <img
                      src={safeMediaUrl(imagePreviewUrl) ?? ''}
                      alt="Reference"
                      className="h-8 w-8 rounded-md border border-border object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearImage}
                      aria-label={t.removeImage}
                      className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-card text-foreground/90 ring-1 ring-foreground/20 hover:bg-surface-2"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
                {uploadedImageUrl ? (
                  <span className="text-[10px] uppercase tracking-wide text-emerald-300/80">
                    {t.imageAttached}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {error ? (
            <p className="text-xs leading-5 text-rose-300">{error}</p>
          ) : null}

          {isSplit ? (
            <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
              {scenes.map((text, i) => (
                <div
                  key={i}
                  className="rounded-md border border-border bg-surface-2 p-3"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.scene} {i + 1} ({sceneRange(i)})
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => copyText(text, i)}
                      disabled={isWriting || isSending}
                    >
                      {copiedIndex === i ? (
                        <Check className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                      )}
                      {copiedIndex === i ? t.copied : t.copy}
                    </Button>
                  </div>
                  <SceneText text={text} narrationLabel={t.narration} dir={dir} />
                </div>
              ))}
            </div>
          ) : scenes.length > 0 ? (
            <div className="rounded-md border border-border bg-surface-2 p-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.scenario} ({duration}s)
              </div>
              <SceneText text={scenes[0]} narrationLabel={t.narration} dir={dir} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {scenes.length > 0 ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyText(concatenated, -1)}
                disabled={isWriting || isSending}
              >
                {copiedIndex === -1 ? (
                  <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                {copiedIndex === -1 ? t.copied : isSplit ? t.copyAll : t.copy}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={generate}
                disabled={isWriting || isSending || businessSaving || !canGenerate}
              >
                {isWriting ? (
                  <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                {t.regenerate}
              </Button>
              {isSplit && onSendScenes ? (
                <Button size="sm" onClick={handleSendAll} disabled={isWriting || isSending}>
                  {isSending ? (
                    <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                  )}
                  {t.sendAll}
                </Button>
              ) : (
                <Button size="sm" onClick={handleUseAsPrompt} disabled={isWriting || isSending}>
                  <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
                  {t.useAsPrompt}
                </Button>
              )}
            </>
          ) : (
            <Button onClick={generate} disabled={isWriting || businessSaving || !canGenerate} size="sm">
              {isWriting ? (
                <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
              )}
              {t.writeScenario}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
