import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Loader2,
  MessageSquareQuote,
  Volume2,
  Mic,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Languages,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { proxiedVideoUrl } from '@/modules/generator-ui/lib/proxiedVideoUrl'
import {
  extractNarration,
  compareNarration,
  type NarrationCheck,
} from '@/modules/generator-ui/lib/narration'

type TranscriptWord = { text: string; lowConfidence: boolean; confidence: number }

type TranscriptResponse = {
  transcript?: string
  words?: TranscriptWord[]
  error?: string
}

export interface NarrationDialogProps {
  open: boolean
  onClose: () => void
  /** The card's full input prompt (narration is extracted from it as fallback). */
  prompt: string | null
  /**
   * Authoritative narration captured from the scenario when the card was
   * created. When present it is the source of truth ("ملاک") and overrides
   * extraction from the prompt. One spoken line per newline.
   */
  narrationText?: string | null
  /** Storage path / URL to the rendered film, when the card has a video. */
  videoStoragePath: string | null
}

function rtlOf(text: string): 'rtl' | 'ltr' {
  return /[\u0600-\u06FF]/.test(text) ? 'rtl' : 'ltr'
}

const TRANSLATE_LANGS: { code: string; label: string }[] = [
  { code: 'fa', label: 'فارسی' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
]

// Static UI labels per language (English fallback). Switching these costs
// nothing and stays instant — no AI call for fixed strings.
type UIKey =
  | 'narration' | 'close' | 'fromPrompt' | 'readAloud' | 'pause' | 'original'
  | 'noPrompt' | 'onFilm' | 'filmVoice' | 'noVideo' | 'listening' | 'retry'
  | 'checkOnFilm' | 'mispronounced' | 'noSpeech' | 'check' | 'match'
  | 'different' | 'wordDiff' | 'diffLegend' | 'missingOnFilm' | 'extraOnFilm'
  | 'pronIssues' | 'translation'

const UI_STRINGS: Record<string, Partial<Record<UIKey, string>>> = {
  en: {
    narration: 'Narration', close: 'Close', fromPrompt: 'From prompt',
    readAloud: 'Read aloud', pause: 'Pause', original: 'Original',
    noPrompt: "No narration detected in this card's prompt. The narration / spoken lines appear here when the scene includes a narration line or quoted dialogue.",
    onFilm: 'On film', filmVoice: 'Film voice',
    noVideo: 'No rendered video yet — generate this card to check the spoken narration.',
    listening: 'Listening to the film…', retry: 'Retry',
    checkOnFilm: 'Check narration on film',
    mispronounced: 'Highlighted words may be mispronounced — click one to hear the correct pronunciation.',
    noSpeech: 'No speech detected in this film.', check: 'Check',
    match: 'match', different: 'different', wordDiff: 'Word-by-word diff',
    diffLegend: 'prompt vs film. red = missing on film, amber = extra/wrong on film.',
    missingOnFilm: 'Missing on film:', extraOnFilm: 'Extra / wrong on film:',
    pronIssues: 'Possible pronunciation issues:', translation: 'Translation',
  },
  fa: {
    narration: 'روایت', close: 'بستن', fromPrompt: 'از پرامپت',
    readAloud: 'خواندن با صدا', pause: 'مکث', original: 'اصلی',
    noPrompt: 'هیچ روایتی در پرامپت این کارت یافت نشد. وقتی صحنه شامل یک خط روایت یا دیالوگ نقل‌قول‌شده باشد، روایت/خطوط گفتاری اینجا نمایش داده می‌شود.',
    onFilm: 'روی فیلم', filmVoice: 'صدای فیلم',
    noVideo: 'هنوز ویدیویی ساخته نشده — این کارت را بسازید تا روایت گفتاری بررسی شود.',
    listening: 'در حال گوش دادن به فیلم…', retry: 'تلاش دوباره',
    checkOnFilm: 'بررسی روایت روی فیلم',
    mispronounced: 'کلمات مشخص‌شده ممکن است اشتباه تلفظ شده باشند — روی هرکدام کلیک کنید تا تلفظ درست را بشنوید.',
    noSpeech: 'هیچ گفتاری در این فیلم یافت نشد.', check: 'بررسی',
    match: 'تطابق', different: 'تفاوت', wordDiff: 'مقایسهٔ کلمه‌به‌کلمه',
    diffLegend: 'پرامپت در برابر فیلم. قرمز = جا افتاده در فیلم، کهربایی = اضافه/اشتباه در فیلم.',
    missingOnFilm: 'جا افتاده در فیلم:', extraOnFilm: 'اضافه / اشتباه در فیلم:',
    pronIssues: 'مشکلات احتمالی تلفظ:', translation: 'ترجمه',
  },
  ar: {
    narration: 'السرد', close: 'إغلاق', fromPrompt: 'من الموجّه',
    readAloud: 'قراءة بصوت', pause: 'إيقاف مؤقت', original: 'الأصل',
    noPrompt: 'لم يتم العثور على سرد في موجّه هذه البطاقة. تظهر هنا أسطر السرد / الحوار عندما يتضمّن المشهد سطر سرد أو حوارًا مقتبسًا.',
    onFilm: 'في الفيلم', filmVoice: 'صوت الفيلم',
    noVideo: 'لا يوجد فيديو بعد — أنشئ هذه البطاقة للتحقق من السرد المنطوق.',
    listening: 'الاستماع إلى الفيلم…', retry: 'إعادة المحاولة',
    checkOnFilm: 'تحقّق من السرد في الفيلم',
    mispronounced: 'قد تكون الكلمات المميّزة منطوقة بشكل خاطئ — انقر على إحداها لسماع النطق الصحيح.',
    noSpeech: 'لم يتم اكتشاف كلام في هذا الفيلم.', check: 'التحقّق',
    match: 'تطابق', different: 'اختلاف', wordDiff: 'مقارنة كلمة بكلمة',
    diffLegend: 'الموجّه مقابل الفيلم. أحمر = مفقود في الفيلم، كهرماني = زائد/خاطئ في الفيلم.',
    missingOnFilm: 'مفقود في الفيلم:', extraOnFilm: 'زائد / خاطئ في الفيلم:',
    pronIssues: 'مشكلات نطق محتملة:', translation: 'الترجمة',
  },
  tr: {
    narration: 'Anlatım', close: 'Kapat', fromPrompt: 'İstemden',
    readAloud: 'Sesli oku', pause: 'Duraklat', original: 'Orijinal',
    noPrompt: 'Bu kartın isteminde anlatım bulunamadı. Sahne bir anlatım satırı veya alıntılanmış diyalog içerdiğinde anlatım / konuşma satırları burada görünür.',
    onFilm: 'Filmde', filmVoice: 'Film sesi',
    noVideo: 'Henüz oluşturulmuş video yok — konuşma anlatımını kontrol etmek için bu kartı oluşturun.',
    listening: 'Film dinleniyor…', retry: 'Tekrar dene',
    checkOnFilm: 'Filmde anlatımı kontrol et',
    mispronounced: 'Vurgulanan kelimeler yanlış telaffuz edilmiş olabilir — doğru telaffuzu duymak için birine tıklayın.',
    noSpeech: 'Bu filmde konuşma algılanmadı.', check: 'Kontrol',
    match: 'eşleşme', different: 'farklı', wordDiff: 'Kelime kelime fark',
    diffLegend: 'istem ile film. kırmızı = filmde eksik, kehribar = filmde fazla/yanlış.',
    missingOnFilm: 'Filmde eksik:', extraOnFilm: 'Filmde fazla / yanlış:',
    pronIssues: 'Olası telaffuz sorunları:', translation: 'Çeviri',
  },
  es: {
    narration: 'Narración', close: 'Cerrar', fromPrompt: 'Del prompt',
    readAloud: 'Leer en voz alta', pause: 'Pausar', original: 'Original',
    noPrompt: 'No se detectó narración en el prompt de esta tarjeta. Las líneas de narración / diálogo aparecen aquí cuando la escena incluye una línea de narración o diálogo citado.',
    onFilm: 'En el film', filmVoice: 'Voz del film',
    noVideo: 'Aún no hay video renderizado — genera esta tarjeta para revisar la narración hablada.',
    listening: 'Escuchando el film…', retry: 'Reintentar',
    checkOnFilm: 'Comprobar narración en el film',
    mispronounced: 'Las palabras resaltadas pueden estar mal pronunciadas — haz clic en una para oír la pronunciación correcta.',
    noSpeech: 'No se detectó voz en este film.', check: 'Comprobación',
    match: 'coincidencia', different: 'diferente', wordDiff: 'Diferencia palabra por palabra',
    diffLegend: 'prompt vs film. rojo = falta en el film, ámbar = extra/incorrecto en el film.',
    missingOnFilm: 'Falta en el film:', extraOnFilm: 'Extra / incorrecto en el film:',
    pronIssues: 'Posibles problemas de pronunciación:', translation: 'Traducción',
  },
  fr: {
    narration: 'Narration', close: 'Fermer', fromPrompt: 'Du prompt',
    readAloud: 'Lire à voix haute', pause: 'Pause', original: 'Original',
    noPrompt: "Aucune narration détectée dans le prompt de cette carte. Les lignes de narration / dialogue apparaissent ici lorsque la scène inclut une ligne de narration ou un dialogue cité.",
    onFilm: 'Dans le film', filmVoice: 'Voix du film',
    noVideo: "Pas encore de vidéo rendue — générez cette carte pour vérifier la narration parlée.",
    listening: 'Écoute du film…', retry: 'Réessayer',
    checkOnFilm: 'Vérifier la narration dans le film',
    mispronounced: 'Les mots surlignés peuvent être mal prononcés — cliquez sur l’un d’eux pour entendre la bonne prononciation.',
    noSpeech: 'Aucune parole détectée dans ce film.', check: 'Vérification',
    match: 'correspondance', different: 'différent', wordDiff: 'Différence mot à mot',
    diffLegend: 'prompt vs film. rouge = manquant dans le film, ambre = en trop/erroné dans le film.',
    missingOnFilm: 'Manquant dans le film :', extraOnFilm: 'En trop / erroné dans le film :',
    pronIssues: 'Problèmes de prononciation possibles :', translation: 'Traduction',
  },
}



export function NarrationDialog({ open, onClose, prompt, narrationText, videoStoragePath }: NarrationDialogProps) {
  const promptLines = narrationText
    ? narrationText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    : extractNarration(prompt)
  const hasVideo = Boolean(videoStoragePath)

  const [transcript, setTranscript] = useState<string | null>(null)
  const [words, setWords] = useState<TranscriptWord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [check, setCheck] = useState<NarrationCheck | null>(null)

  const [pronouncing, setPronouncing] = useState<number | null>(null)
  const [playingWord, setPlayingWord] = useState<number | null>(null)
  const audioCache = useRef<Map<string, string>>(new Map())
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Full film-audio playback so the user can hear the actual film voice and
  // compare it with the reference narration text above.
  const filmAudioRef = useRef<HTMLAudioElement | null>(null)
  const [filmAudioUrl, setFilmAudioUrl] = useState<string | null>(null)
  const [filmLoading, setFilmLoading] = useState(false)
  const [filmPlaying, setFilmPlaying] = useState(false)
  const [filmTime, setFilmTime] = useState(0)
  const [filmDuration, setFilmDuration] = useState(0)

  // Read-aloud + translation for the prompt narration text.
  const promptText = useMemo(() => promptLines.join('\n'), [promptLines])
  const narrAudioRef = useRef<HTMLAudioElement | null>(null)
  const narrCache = useRef<Map<string, string>>(new Map())
  const [narrPlaying, setNarrPlaying] = useState(false)
  const [narrLoading, setNarrLoading] = useState(false)
  const [targetLang, setTargetLang] = useState('')
  const [translation, setTranslation] = useState<string | null>(null)
  const [transcriptTranslation, setTranscriptTranslation] = useState<string | null>(null)
  const [checkMessageTranslation, setCheckMessageTranslation] = useState<string | null>(null)
  const [missingWordsTranslation, setMissingWordsTranslation] = useState<string | null>(null)
  const [extraWordsTranslation, setExtraWordsTranslation] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  // Cache translations per `${lang}::${text}` so re-selecting a language is
  // instant and avoids repeat AI calls.
  const translationCache = useRef<Map<string, string>>(new Map())

  // Reset transient state whenever the panel is (re)opened for a card.
  useEffect(() => {
    if (!open) return
    setTranscript(null)
    setWords([])
    setError(null)
    setCheck(null)
    setFilmPlaying(false)
    setFilmTime(0)
    setFilmDuration(0)
    setNarrPlaying(false)
    setTargetLang('')
    setTranslation(null)
    setTranscriptTranslation(null)
    setCheckMessageTranslation(null)
    setMissingWordsTranslation(null)
    setExtraWordsTranslation(null)
    if (filmAudioRef.current) {
      filmAudioRef.current.pause()
      filmAudioRef.current.currentTime = 0
    }
    if (narrAudioRef.current) {
      narrAudioRef.current.pause()
      narrAudioRef.current.currentTime = 0
    }
  }, [open, prompt, videoStoragePath])

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause()
      if (filmAudioRef.current) filmAudioRef.current.pause()
      if (narrAudioRef.current) narrAudioRef.current.pause()
      for (const url of audioCache.current.values()) URL.revokeObjectURL(url)
      for (const url of narrCache.current.values()) URL.revokeObjectURL(url)
      audioCache.current.clear()
      narrCache.current.clear()
    }
  }, [])

  const toggleFilmAudio = useCallback(async () => {
    if (!videoStoragePath) return
    const el = filmAudioRef.current
    if (el && filmPlaying) {
      el.pause()
      return
    }
    // Lazily resolve a playable URL the first time the user hits play.
    if (!filmAudioUrl) {
      setFilmLoading(true)
      try {
        let url = videoStoragePath
        try {
          url = await proxiedVideoUrl(videoStoragePath)
        } catch {
          /* fall back to raw path */
        }
        setFilmAudioUrl(url)
      } finally {
        setFilmLoading(false)
      }
      return
    }
    try {
      await el?.play()
    } catch {
      toast.error('Could not play the film audio.')
    }
  }, [videoStoragePath, filmPlaying, filmAudioUrl])

  // Once a URL is resolved (first play), start playback automatically.
  useEffect(() => {
    if (!filmAudioUrl) return
    const el = filmAudioRef.current
    if (!el) return
    el.play().catch(() => {
      /* user can press play again */
    })
  }, [filmAudioUrl])

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }


  const runTranscribe = useCallback(async () => {
    if (!videoStoragePath) return
    setLoading(true)
    setError(null)
    try {
      let fetchUrl = videoStoragePath
      try {
        fetchUrl = await proxiedVideoUrl(videoStoragePath)
      } catch {
        /* fall back to the raw path */
      }
      const { data, error: fnError } = await supabase.functions.invoke<TranscriptResponse>(
        'video-transcript',
        { body: { videoUrl: fetchUrl } },
      )
      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)
      const text = (data?.transcript ?? '').trim()
      const w = Array.isArray(data?.words) ? data!.words : []
      setTranscript(text)
      setWords(w)
      setCheck(compareNarration(promptLines, text))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to transcribe.')
    } finally {
      setLoading(false)
    }
    // promptLines is derived from prompt; intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoStoragePath, prompt])

  const playPronunciation = useCallback(async (rawWord: string, index: number) => {
    const word = rawWord.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim()
    if (!word) return
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    const key = word.toLowerCase()
    const playUrl = (url: string) => {
      const audio = audioRef.current ?? new Audio()
      audioRef.current = audio
      audio.src = url
      audio.onended = () => setPlayingWord(null)
      setPlayingWord(index)
      void audio.play().catch(() => setPlayingWord(null))
    }
    const cached = audioCache.current.get(key)
    if (cached) { playUrl(cached); return }
    setPronouncing(index)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        audioBase64?: string
        mimeType?: string
        error?: string
      }>('tts-generate', { body: { text: word, gender: 'female', tone: 'narrative' } })
      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)
      if (!data?.audioBase64) throw new Error('No audio returned')
      const bin = atob(data.audioBase64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const blob = new Blob([bytes], { type: data.mimeType || 'audio/wav' })
      const url = URL.createObjectURL(blob)
      audioCache.current.set(key, url)
      playUrl(url)
    } catch {
      toast.error('Could not play pronunciation.')
    } finally {
      setPronouncing(null)
    }
  }, [])

  // Read the narration aloud — reads the translation when one is shown,
  // otherwise the original prompt narration. Audio is cached per text.
  const speakNarration = useCallback(async () => {
    const el = narrAudioRef.current
    if (el && narrPlaying) {
      el.pause()
      return
    }
    const text = (translation ?? promptText).trim()
    if (!text) return
    const key = text.slice(0, 5000)
    const playUrl = (url: string) => {
      const audio = narrAudioRef.current ?? new Audio()
      narrAudioRef.current = audio
      audio.src = url
      audio.onended = () => setNarrPlaying(false)
      audio.onpause = () => setNarrPlaying(false)
      setNarrPlaying(true)
      void audio.play().catch(() => setNarrPlaying(false))
    }
    const cached = narrCache.current.get(key)
    if (cached) { playUrl(cached); return }
    setNarrLoading(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        audioBase64?: string
        mimeType?: string
        error?: string
      }>('tts-generate', { body: { text: key, gender: 'female', tone: 'narrative' } })
      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)
      if (!data?.audioBase64) throw new Error('No audio returned')
      const bin = atob(data.audioBase64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const blob = new Blob([bytes], { type: data.mimeType || 'audio/wav' })
      const url = URL.createObjectURL(blob)
      narrCache.current.set(key, url)
      playUrl(url)
    } catch {
      toast.error('Could not read the narration aloud.')
    } finally {
      setNarrLoading(false)
    }
  }, [translation, promptText, narrPlaying])

  // Translate a single chunk via the edge function, with per-language caching.
  const translateOne = useCallback(async (text: string, lang: string): Promise<string | null> => {
    const clean = text.trim()
    if (!clean) return null
    const key = `${lang}::${clean.slice(0, 5000)}`
    const cached = translationCache.current.get(key)
    if (cached) return cached
    const { data, error: fnError } = await supabase.functions.invoke<{
      translation?: string
      error?: string
    }>('translate-text', { body: { text: clean, targetLang: lang } })
    if (fnError) throw new Error(fnError.message)
    if (data?.error) throw new Error(data.error)
    if (!data?.translation) throw new Error('No translation returned')
    translationCache.current.set(key, data.translation)
    return data.translation
  }, [])

  // Translate the whole panel — prompt narration, film transcript and the
  // check summary — into the chosen language at once.
  const translateNarration = useCallback(async (lang: string) => {
    setTargetLang(lang)
    // Stop any narration playback so the next read uses the chosen version.
    if (narrAudioRef.current) narrAudioRef.current.pause()
    if (!lang) {
      setTranslation(null)
      setTranscriptTranslation(null)
      setCheckMessageTranslation(null)
      setMissingWordsTranslation(null)
      setExtraWordsTranslation(null)
      return
    }
    setTranslating(true)
    setTranslation(null)
    setTranscriptTranslation(null)
    setCheckMessageTranslation(null)
    setMissingWordsTranslation(null)
    setExtraWordsTranslation(null)
    try {
      const missingJoined = check?.missingWords?.length ? check.missingWords.join('، ') : ''
      const extraJoined = check?.extraWords?.length ? check.extraWords.join('، ') : ''
      const [pt, tt, cm, mw, ew] = await Promise.all([
        translateOne(promptText, lang),
        translateOne(transcript ?? '', lang),
        translateOne(check?.message ?? '', lang),
        translateOne(missingJoined, lang),
        translateOne(extraJoined, lang),
      ])
      setTranslation(pt)
      setTranscriptTranslation(tt)
      setCheckMessageTranslation(cm)
      setMissingWordsTranslation(mw)
      setExtraWordsTranslation(ew)
    } catch {
      toast.error('Could not translate the narration.')
      setTargetLang('')
    } finally {
      setTranslating(false)
    }
  }, [promptText, transcript, check, translateOne])

  // If a language is already selected when a transcript / check arrives later,
  // translate the new content automatically.
  useEffect(() => {
    if (!targetLang || !transcript) return
    let cancelled = false
    ;(async () => {
      try {
        const missingJoined = check?.missingWords?.length ? check.missingWords.join('، ') : ''
        const extraJoined = check?.extraWords?.length ? check.extraWords.join('، ') : ''
        const [tt, cm, mw, ew] = await Promise.all([
          translateOne(transcript, targetLang),
          translateOne(check?.message ?? '', targetLang),
          translateOne(missingJoined, targetLang),
          translateOne(extraJoined, targetLang),
        ])
        if (cancelled) return
        setTranscriptTranslation(tt)
        setCheckMessageTranslation(cm)
        setMissingWordsTranslation(mw)
        setExtraWordsTranslation(ew)
      } catch {
        /* leave originals visible */
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, check, targetLang])

  // Resolve a static UI label in the active language (English fallback).
  const t = useCallback(
    (key: UIKey): string => UI_STRINGS[targetLang]?.[key] ?? UI_STRINGS.en[key] ?? key,
    [targetLang],
  )



  if (!open) return null

  const lowConfWords = words.filter((w) => w.lowConfidence)
  const showWords = words.length > 0

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col rounded-2xl bg-[#07080a]/95 backdrop-blur"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Narration"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <MessageSquareQuote className="h-4 w-4 text-violet-300" aria-hidden="true" />
          {t('narration')}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close narration"
          title="Close"
          className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/60 text-zinc-200 transition hover:border-rose-300/40 hover:bg-rose-500/20 hover:text-rose-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* 1) Narration from the prompt */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t('fromPrompt')}
            </h3>
            {promptLines.length > 0 ? (
              <div className="flex items-center gap-2">
                {/* Translate language selector */}
                <div className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] pl-2 pr-1 py-0.5">
                  <Languages className="h-3.5 w-3.5 text-violet-300" aria-hidden="true" />
                  <select
                    value={targetLang}
                    onChange={(e) => void translateNarration(e.target.value)}
                    disabled={translating}
                    aria-label="Translate narration"
                    className="cursor-pointer rounded-full bg-transparent py-0.5 text-xs font-medium text-zinc-200 outline-none [&>option]:bg-[#0b0c10] [&>option]:text-zinc-200"
                  >
                    <option value="">{t('original')}</option>
                    {TRANSLATE_LANGS.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                  {translating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300" aria-hidden="true" />
                  ) : null}
                </div>
                {/* Read aloud */}
                <button
                  type="button"
                  onClick={() => void speakNarration()}
                  disabled={narrLoading}
                  aria-label={narrPlaying ? t('pause') : t('readAloud')}
                  title={narrPlaying ? t('pause') : t('readAloud')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-wait"
                >
                  {narrLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : narrPlaying ? (
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t('readAloud')}
                </button>
              </div>
            ) : null}
          </div>
          {promptLines.length > 0 ? (
            <>
              <ul dir="auto" className="space-y-2">
                {promptLines.map((line, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-violet-400/20 bg-violet-500/[0.06] px-3 py-2 text-sm leading-6 text-zinc-100"
                  >
                    {line}
                  </li>
                ))}
              </ul>
              {translation ? (
                <div
                  dir="auto"
                  className="rounded-lg border border-sky-400/20 bg-sky-500/[0.06] px-3 py-2 text-sm leading-6 text-zinc-100"
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">
                    {TRANSLATE_LANGS.find((l) => l.code === targetLang)?.label ?? t('translation')}
                  </p>
                  {translation}
                </div>
              ) : null}
              {/* Hidden audio element for narration read-aloud */}
              <audio ref={narrAudioRef} className="hidden" />
            </>
          ) : (
            <p className="text-sm leading-6 text-zinc-400">
              {t('noPrompt')}
            </p>
          )}
        </section>


        {/* 2) Narration on the film */}
        <section className="space-y-2 border-t border-white/10 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {t('onFilm')}
          </h3>

          {/* Full film-audio player — hear the real film voice and compare it
              with the reference narration above. */}
          {hasVideo ? (
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <button
                type="button"
                onClick={() => void toggleFilmAudio()}
                disabled={filmLoading}
                aria-label={filmPlaying ? 'Pause film audio' : 'Play film audio'}
                title={filmPlaying ? 'Pause film audio' : 'Play film audio'}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-violet-400/40 bg-violet-500/15 text-violet-100 transition hover:bg-violet-500/25 disabled:cursor-wait"
              >
                {filmLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : filmPlaying ? (
                  <Pause className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Play className="h-4 w-4 translate-x-0.5" aria-hidden="true" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-zinc-300">{t('filmVoice')}</p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-violet-400 transition-[width] duration-150"
                    style={{ width: filmDuration > 0 ? `${(filmTime / filmDuration) * 100}%` : '0%' }}
                  />
                </div>
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">
                {fmt(filmTime)} / {fmt(filmDuration)}
              </span>
              {filmAudioUrl ? (
                <audio
                  ref={filmAudioRef}
                  src={filmAudioUrl}
                  preload="metadata"
                  onPlay={() => setFilmPlaying(true)}
                  onPause={() => setFilmPlaying(false)}
                  onEnded={() => setFilmPlaying(false)}
                  onTimeUpdate={(e) => setFilmTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setFilmDuration(e.currentTarget.duration)}
                  className="hidden"
                />
              ) : null}
            </div>
          ) : null}


          {!hasVideo ? (
            <p className="text-sm leading-6 text-zinc-500">
              {t('noVideo')}
            </p>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t('listening')}
            </div>
          ) : error ? (
            <div className="space-y-2">
              <p className="text-sm text-rose-300">{error}</p>
              <button
                type="button"
                onClick={() => void runTranscribe()}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.08]"
              >
                <Mic className="h-3.5 w-3.5" aria-hidden="true" /> {t('retry')}
              </button>
            </div>
          ) : transcript === null ? (
            <button
              type="button"
              onClick={() => void runTranscribe()}
              className="inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/10 px-4 py-1.5 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/20"
            >
              <Mic className="h-3.5 w-3.5" aria-hidden="true" /> {t('checkOnFilm')}
            </button>
          ) : (
            <>
              {lowConfWords.length > 0 ? (
                <p className="flex items-center gap-2 text-[11px] text-amber-300/90">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                  {t('mispronounced')}
                </p>
              ) : null}
              <p
                dir={rtlOf(transcript)}
                className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-200"
              >
                {showWords
                  ? words.map((w, i) => (
                      <span key={`${i}-${w.text}`}>
                        {w.lowConfidence ? (
                          <button
                            type="button"
                            onClick={() => void playPronunciation(w.text, i)}
                            disabled={pronouncing === i}
                            title="Click to hear the correct pronunciation"
                            className={`inline-flex items-center gap-0.5 rounded-sm bg-amber-400/10 px-0.5 align-baseline text-amber-300 underline decoration-dotted decoration-amber-400/70 underline-offset-2 transition hover:bg-amber-400/20 hover:text-amber-200 disabled:cursor-wait ${
                              playingWord === i ? 'bg-amber-400/25 text-amber-100' : ''
                            }`}
                          >
                            {w.text}
                            {pronouncing === i ? (
                              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                            ) : (
                              <Volume2 className="h-3 w-3" aria-hidden="true" />
                            )}
                          </button>
                        ) : (
                          w.text
                        )}
                        {i < words.length - 1 ? ' ' : ''}
                      </span>
                    ))
                  : transcript || t('noSpeech')}
              </p>
              {transcriptTranslation ? (
                <div
                  dir="auto"
                  className="rounded-lg border border-sky-400/20 bg-sky-500/[0.06] px-3 py-2 text-sm leading-6 text-zinc-100"
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">
                    {TRANSLATE_LANGS.find((l) => l.code === targetLang)?.label ?? t('translation')}
                  </p>
                  {transcriptTranslation}
                </div>
              ) : null}
            </>
          )}
        </section>

        {/* 3) Comparison / health check */}
        {check ? (
          <section className="space-y-2 border-t border-white/10 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t('check')}
            </h3>
            <div
              className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm leading-6 ${
                check.status === 'ok'
                  ? 'border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-100'
                  : check.status === 'none'
                    ? 'border-white/10 bg-white/[0.03] text-zinc-300'
                    : 'border-amber-400/30 bg-amber-500/[0.08] text-amber-100'
              }`}
            >
              <div className="flex items-start gap-2">
                {check.status === 'ok' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                ) : check.status === 'none' ? null : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span>{check.message}</span>
              </div>
              {checkMessageTranslation ? (
                <p dir="auto" className="pl-6 text-[13px] text-sky-200/90">
                  {checkMessageTranslation}
                </p>
              ) : null}
            </div>

            {/* Percentage match / difference meter */}
            {check.status === 'ok' || check.status === 'mismatch' ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-medium">
                  <span className="text-emerald-300">{check.matchPercent}% {t('match')}</span>
                  <span className="text-amber-300">{check.errorPercent}% {t('different')}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-amber-500/25">
                  <div
                    className={`h-full rounded-full transition-[width] ${
                      check.matchPercent >= 80 ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${check.matchPercent}%` }}
                  />
                </div>
              </div>
            ) : null}

            {/* Word-level diff: where exactly prompt and film differ */}
            {check.diff.length > 0 && (check.status === 'ok' || check.status === 'mismatch') ? (
              <div className="space-y-2">
                <p className="text-[11px] text-zinc-400">
                  <span className="text-zinc-300">{t('wordDiff')}</span> — {t('diffLegend')}
                </p>
                <p dir="auto" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[14px] leading-7">
                  {check.diff.map((tok, i) => (
                    <span
                      key={i}
                      className={
                        tok.kind === 'missing'
                          ? 'rounded-sm bg-rose-500/15 px-0.5 text-rose-300 line-through decoration-rose-400/70'
                          : tok.kind === 'extra'
                            ? 'rounded-sm bg-amber-400/15 px-0.5 text-amber-300 underline decoration-dotted decoration-amber-400/70 underline-offset-2'
                            : 'text-zinc-200'
                      }
                    >
                      {tok.text}
                      {i < check.diff.length - 1 ? ' ' : ''}
                    </span>
                  ))}
                </p>
                {check.missingWords.length > 0 ? (
                  <p dir="auto" className="text-[12px] leading-5 text-rose-300/90">
                    Missing on film: {check.missingWords.join('، ')}
                  </p>
                ) : null}
                {check.extraWords.length > 0 ? (
                  <p dir="auto" className="text-[12px] leading-5 text-amber-300/90">
                    Extra / wrong on film: {check.extraWords.join('، ')}
                  </p>
                ) : null}
              </div>
            ) : null}

            {lowConfWords.length > 0 ? (
              <p className="text-[12px] leading-5 text-amber-300/90">
                Possible pronunciation issues: {lowConfWords.map((w) => w.text).join('، ')}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  )
}

export default NarrationDialog
