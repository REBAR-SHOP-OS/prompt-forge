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

type Lang = 'en' | 'fa' | 'ar' | 'tr' | 'es' | 'fr'
const RTL_LANGS: Lang[] = ['fa', 'ar']
const LANG_OPTIONS: { value: Lang; native: string }[] = [
  { value: 'en', native: 'English' },
  { value: 'fa', native: 'فارسی' },
  { value: 'ar', native: 'العربية' },
  { value: 'tr', native: 'Türkçe' },
  { value: 'es', native: 'Español' },
  { value: 'fr', native: 'Français' },
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
  fa: {
    title: 'سناریونویس',
    description: 'مدت‌زمان را انتخاب کنید، ایده‌تان را (به هر زبانی) بنویسید و یک سناریوی سینمایی متناسب با آن مدت دریافت کنید. در صورت تمایل یک تصویر مرجع پیوست کنید.',
    businessLabel: 'درباره کسب‌وکار شما',
    businessRequired: '(الزامی)',
    businessPlaceholder: 'کسب‌وکار خود را توصیف کنید: چه می‌فروشید، محصولات/خدمات، مخاطب هدف و لحن برند…',
    businessSave: 'ذخیره',
    businessSaved: 'ذخیره شد',
    duration: 'مدت‌زمان',
    yourIdea: 'ایده شما',
    autoFromImage: 'خودکار از تصویر',
    writeMyOwn: 'خودم می‌نویسم',
    ideaPlaceholderAuto: 'سناریو به‌صورت خودکار از روی تصویر بارگذاری‌شده نوشته می‌شود…',
    ideaPlaceholder: 'ایده‌تان را بنویسید (به هر زبانی)…',
    attachImage: 'پیوست تصویر مرجع',
    removeImage: 'حذف تصویر',
    imageAttached: 'تصویر پیوست شد',
    scene: 'صحنه',
    scenario: 'سناریو',
    copy: 'کپی',
    copied: 'کپی شد',
    copyAll: 'کپی همه',
    regenerate: 'تولید مجدد',
    sendAll: 'ارسال همه به در انتظار',
    useAsPrompt: 'استفاده به‌عنوان پرامپت',
    writeScenario: 'نوشتن سناریو',
    errSignIn: 'برای پیوست تصویر وارد حساب شوید.',
    errOnlyImages: 'فقط فایل‌های تصویری پشتیبانی می‌شوند.',
    errTooLarge: 'تصویر بیش از حد بزرگ است (حداکثر ۱۰ مگابایت).',
    errUploadFailed: 'بارگذاری تصویر ناموفق بود',
    errBusiness: 'ابتدا کسب‌وکار خود را توصیف کنید — سناریو باید مرتبط با آن باشد.',
    errEmpty: 'پاسخ هوش مصنوعی خالی بود',
    errFailedWrite: 'نوشتن سناریو ناموفق بود',
    errFailedSend: 'ارسال به در انتظار ناموفق بود',
  },
  ar: {
    title: 'كاتب السيناريو',
    description: 'اختر المدة، صف فكرتك (بأي لغة)، واحصل على سيناريو سينمائي مناسب لتلك المدة. يمكنك إرفاق صورة مرجعية اختياريًا.',
    businessLabel: 'عن عملك',
    businessRequired: '(مطلوب)',
    businessPlaceholder: 'صف عملك: ماذا تبيع، منتجاتك/خدماتك، الجمهور المستهدف، ونبرة العلامة التجارية…',
    businessSave: 'حفظ',
    businessSaved: 'تم الحفظ',
    duration: 'المدة',
    yourIdea: 'فكرتك',
    autoFromImage: 'تلقائي من الصورة',
    writeMyOwn: 'سأكتب بنفسي',
    ideaPlaceholderAuto: 'سيُكتب السيناريو تلقائيًا من الصورة المرفوعة…',
    ideaPlaceholder: 'صف فكرتك (بأي لغة)…',
    attachImage: 'إرفاق صورة مرجعية',
    removeImage: 'إزالة الصورة',
    imageAttached: 'تم إرفاق الصورة',
    scene: 'مشهد',
    scenario: 'السيناريو',
    copy: 'نسخ',
    copied: 'تم النسخ',
    copyAll: 'نسخ الكل',
    regenerate: 'إعادة التوليد',
    sendAll: 'إرسال الكل إلى قيد الانتظار',
    useAsPrompt: 'استخدام كموجّه',
    writeScenario: 'كتابة السيناريو',
    errSignIn: 'يرجى تسجيل الدخول لإرفاق صورة.',
    errOnlyImages: 'الملفات الصورية فقط مدعومة.',
    errTooLarge: 'الصورة كبيرة جدًا (الحد الأقصى ١٠ ميغابايت).',
    errUploadFailed: 'فشل رفع الصورة',
    errBusiness: 'يرجى وصف عملك أولاً — يجب أن يكون السيناريو مرتبطًا به.',
    errEmpty: 'استجابة فارغة من الذكاء الاصطناعي',
    errFailedWrite: 'فشل في كتابة السيناريو',
    errFailedSend: 'فشل الإرسال إلى قيد الانتظار',
  },
  tr: {
    title: 'Senaryo Yazarı',
    description: 'Bir süre seçin, fikrinizi (herhangi bir dilde) anlatın ve o süreye uygun sinematik bir senaryo alın. İsteğe bağlı olarak bir referans görseli ekleyin.',
    businessLabel: 'İşletmeniz hakkında',
    businessRequired: '(zorunlu)',
    businessPlaceholder: 'İşletmenizi tanımlayın: ne sattığınız, ürün/hizmetleriniz, hedef kitleniz ve marka tonunuz…',
    businessSave: 'Kaydet',
    businessSaved: 'Kaydedildi',
    duration: 'Süre',
    yourIdea: 'Fikriniz',
    autoFromImage: 'Görselden otomatik',
    writeMyOwn: 'Kendim yazayım',
    ideaPlaceholderAuto: 'Senaryo, yüklenen görselden otomatik olarak yazılacak…',
    ideaPlaceholder: 'Fikrinizi anlatın (herhangi bir dilde)…',
    attachImage: 'Referans görseli ekle',
    removeImage: 'Görseli kaldır',
    imageAttached: 'Görsel eklendi',
    scene: 'Sahne',
    scenario: 'Senaryo',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    copyAll: 'Tümünü kopyala',
    regenerate: 'Yeniden oluştur',
    sendAll: 'Tümünü Beklemede’ye gönder',
    useAsPrompt: 'İstem olarak kullan',
    writeScenario: 'Senaryo yaz',
    errSignIn: 'Görsel eklemek için lütfen giriş yapın.',
    errOnlyImages: 'Yalnızca görsel dosyaları desteklenir.',
    errTooLarge: 'Görsel çok büyük (en fazla 10MB).',
    errUploadFailed: 'Görsel yükleme başarısız',
    errBusiness: 'Lütfen önce işletmenizi tanımlayın — senaryo onunla ilgili olmalı.',
    errEmpty: 'Boş yapay zeka yanıtı',
    errFailedWrite: 'Senaryo yazılamadı',
    errFailedSend: 'Beklemede’ye gönderilemedi',
  },
  es: {
    title: 'Guionista',
    description: 'Elige una duración, describe tu idea (en cualquier idioma) y obtén un guion cinematográfico ajustado a esa duración. Opcionalmente adjunta una imagen de referencia.',
    businessLabel: 'Sobre tu negocio',
    businessRequired: '(obligatorio)',
    businessPlaceholder: 'Describe tu negocio: qué vendes, tus productos/servicios, público objetivo y tono de marca…',
    businessSave: 'Guardar',
    businessSaved: 'Guardado',
    duration: 'Duración',
    yourIdea: 'Tu idea',
    autoFromImage: 'Automático desde imagen',
    writeMyOwn: 'Escribir la mía',
    ideaPlaceholderAuto: 'El guion se escribirá automáticamente a partir de la imagen subida…',
    ideaPlaceholder: 'Describe tu idea (en cualquier idioma)…',
    attachImage: 'Adjuntar imagen de referencia',
    removeImage: 'Quitar imagen',
    imageAttached: 'Imagen adjunta',
    scene: 'Escena',
    scenario: 'Guion',
    copy: 'Copiar',
    copied: 'Copiado',
    copyAll: 'Copiar todo',
    regenerate: 'Regenerar',
    sendAll: 'Enviar todo a Pendientes',
    useAsPrompt: 'Usar como prompt',
    writeScenario: 'Escribir guion',
    errSignIn: 'Inicia sesión para adjuntar una imagen.',
    errOnlyImages: 'Solo se admiten archivos de imagen.',
    errTooLarge: 'Imagen demasiado grande (máx. 10MB).',
    errUploadFailed: 'Error al subir la imagen',
    errBusiness: 'Primero describe tu negocio — el guion debe ser relevante para él.',
    errEmpty: 'Respuesta vacía de la IA',
    errFailedWrite: 'No se pudo escribir el guion',
    errFailedSend: 'No se pudo enviar a Pendientes',
  },
  fr: {
    title: 'Scénariste',
    description: 'Choisissez une durée, décrivez votre idée (dans n’importe quelle langue) et obtenez un scénario cinématographique adapté à cette durée. Joignez éventuellement une image de référence.',
    businessLabel: 'À propos de votre entreprise',
    businessRequired: '(obligatoire)',
    businessPlaceholder: 'Décrivez votre entreprise : ce que vous vendez, vos produits/services, votre public cible et le ton de la marque…',
    businessSave: 'Enregistrer',
    businessSaved: 'Enregistré',
    duration: 'Durée',
    yourIdea: 'Votre idée',
    autoFromImage: 'Auto depuis l’image',
    writeMyOwn: 'Écrire la mienne',
    ideaPlaceholderAuto: 'Le scénario sera écrit automatiquement à partir de l’image téléchargée…',
    ideaPlaceholder: 'Décrivez votre idée (dans n’importe quelle langue)…',
    attachImage: 'Joindre une image de référence',
    removeImage: 'Retirer l’image',
    imageAttached: 'Image jointe',
    scene: 'Scène',
    scenario: 'Scénario',
    copy: 'Copier',
    copied: 'Copié',
    copyAll: 'Tout copier',
    regenerate: 'Régénérer',
    sendAll: 'Tout envoyer en Attente',
    useAsPrompt: 'Utiliser comme prompt',
    writeScenario: 'Écrire le scénario',
    errSignIn: 'Veuillez vous connecter pour joindre une image.',
    errOnlyImages: 'Seuls les fichiers image sont pris en charge.',
    errTooLarge: 'Image trop volumineuse (max 10 Mo).',
    errUploadFailed: 'Échec du téléversement de l’image',
    errBusiness: 'Décrivez d’abord votre entreprise — le scénario doit y être pertinent.',
    errEmpty: 'Réponse vide de l’IA',
    errFailedWrite: 'Échec de l’écriture du scénario',
    errFailedSend: 'Échec de l’envoi en Attente',
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
      <DialogContent dir={dir} className="max-w-2xl border-white/10 bg-[#0b0c0e]/95 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-amber-300" aria-hidden="true" />
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
                        : 'border-amber-300/40 bg-amber-300/10 text-amber-300'
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {!businessInfo.trim() && (
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 border-white/10 bg-[#0b0c0e] text-zinc-100">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-300">
                    {t.businessLabel} <span className="text-amber-300">{t.businessRequired}</span>
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
                    className="min-h-[96px] border-white/10 bg-black/30 text-sm text-zinc-100"
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
                  className="h-7 w-auto gap-1.5 rounded-full border-white/10 bg-black/20 px-2.5 text-[11px] font-semibold text-zinc-300"
                  aria-label="Language"
                >
                  <Languages className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
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
          <DialogDescription className="text-zinc-400">
            {t.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t.duration}
            </div>
            <div
              role="radiogroup"
              aria-label="Scenario duration"
              className="inline-flex rounded-full border border-white/10 bg-black/20 p-1 text-xs font-semibold"
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
                        ? 'bg-zinc-100 text-zinc-950'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {sec}s
                  </button>
                )
              })}
            </div>
            {SPLIT_DURATIONS.includes(duration) ? (
              <p className="mt-2 text-xs text-zinc-500">
                {(
                  {
                    en: `Will be split into ${duration / 15} sequential 15s scenes and sent as ${duration / 15} cards.`,
                    fa: `به ${duration / 15} صحنه‌ی ۱۵ ثانیه‌ای متوالی تقسیم و به‌صورت ${duration / 15} کارت ارسال می‌شود.`,
                    ar: `سيُقسَّم إلى ${duration / 15} مشاهد متتالية مدة كل منها ١٥ ثانية وتُرسَل كـ ${duration / 15} بطاقات.`,
                    tr: `${duration / 15} ardışık 15 sn’lik sahneye bölünüp ${duration / 15} kart olarak gönderilecek.`,
                    es: `Se dividirá en ${duration / 15} escenas secuenciales de 15 s y se enviará como ${duration / 15} tarjetas.`,
                    fr: `Sera divisé en ${duration / 15} scènes séquentielles de 15 s et envoyé sous forme de ${duration / 15} cartes.`,
                  } as Record<Lang, string>
                )[lang]}
              </p>
            ) : null}
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {t.yourIdea}
              </div>
              {uploadedImageUrl ? (
                <div
                  role="radiogroup"
                  aria-label="Idea mode"
                  className="inline-flex rounded-full border border-white/10 bg-black/20 p-0.5 text-[11px] font-semibold"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={ideaMode === 'auto'}
                    onClick={() => setIdeaMode('auto')}
                    className={`rounded-full px-2.5 py-1 transition ${
                      ideaMode === 'auto' ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Auto from image
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={ideaMode === 'manual'}
                    onClick={() => setIdeaMode('manual')}
                    className={`rounded-full px-2.5 py-1 transition ${
                      ideaMode === 'manual' ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Write my own
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
                    ? 'The scenario will be written automatically from the uploaded image…'
                    : 'Describe your idea (any language)…'
                }
                className="min-h-[100px] border-white/10 bg-black/30 pb-12 text-zinc-100 disabled:opacity-60"
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
                  title="Attach a reference image"
                  aria-label="Attach a reference image"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  {isUploadingImage ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                {imagePreviewUrl ? (
                  <div className="relative">
                    <img
                      src={imagePreviewUrl}
                      alt="Reference"
                      className="h-8 w-8 rounded-md border border-white/10 object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearImage}
                      aria-label="Remove image"
                      className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900 text-zinc-200 ring-1 ring-white/20 hover:bg-zinc-800"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
                {uploadedImageUrl ? (
                  <span className="text-[10px] uppercase tracking-wide text-emerald-300/80">
                    Image attached
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
                  className="rounded-md border border-white/10 bg-black/30 p-3"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Scene {i + 1} ({sceneRange(i)})
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
                      {copiedIndex === i ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <p dir="ltr" className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          ) : scenes.length > 0 ? (
            <div className="rounded-md border border-white/10 bg-black/30 p-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Scenario ({duration}s)
              </div>
              <p dir="ltr" className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">
                {scenes[0]}
              </p>
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
                {copiedIndex === -1 ? 'Copied' : isSplit ? 'Copy all' : 'Copy'}
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
                Regenerate
              </Button>
              {isSplit && onSendScenes ? (
                <Button size="sm" onClick={handleSendAll} disabled={isWriting || isSending}>
                  {isSending ? (
                    <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                  )}
                  Send all to Pending
                </Button>
              ) : (
                <Button size="sm" onClick={handleUseAsPrompt} disabled={isWriting || isSending}>
                  <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
                  Use as prompt
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
              Write scenario
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
