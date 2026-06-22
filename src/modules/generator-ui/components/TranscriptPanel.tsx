import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, X } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type LangOption = { value: string; label: string; rtl?: boolean }

const ORIGINAL = '__original__'

const LANGUAGES: LangOption[] = [
  { value: ORIGINAL, label: 'متن اصلی' },
  { value: 'Persian', label: 'فارسی', rtl: true },
  { value: 'English', label: 'English' },
  { value: 'Arabic', label: 'العربية', rtl: true },
  { value: 'French', label: 'Français' },
  { value: 'Spanish', label: 'Español' },
  { value: 'German', label: 'Deutsch' },
  { value: 'Turkish', label: 'Türkçe' },
]

type TranscriptResponse = {
  transcript?: string
  translatedText?: string
  targetLanguage?: string
  error?: string
}

export interface TranscriptPanelProps {
  /** A directly-fetchable (signed/public) URL to the film video. */
  videoUrl: string | null
  onClose: () => void
}

export function TranscriptPanel({ videoUrl, onClose }: TranscriptPanelProps) {
  const [transcript, setTranscript] = useState<string | null>(null)
  const [displayText, setDisplayText] = useState<string>('')
  const [language, setLanguage] = useState<string>(ORIGINAL)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Cache of translations keyed by language value.
  const translations = useRef<Map<string, string>>(new Map())

  const isRtl =
    language === ORIGINAL
      ? /[\u0600-\u06FF]/.test(displayText)
      : Boolean(LANGUAGES.find((l) => l.value === language)?.rtl)

  const runTranscribe = useCallback(async () => {
    if (!videoUrl) {
      setError('فایل ویدیو در دسترس نیست.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<TranscriptResponse>(
        'video-transcript',
        { body: { videoUrl } },
      )
      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)
      const text = (data?.transcript ?? '').trim()
      setTranscript(text)
      translations.current.clear()
      translations.current.set(ORIGINAL, text)
      setLanguage(ORIGINAL)
      setDisplayText(text || 'گفتاری در این فیلم تشخیص داده نشد.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در رونویسی')
    } finally {
      setLoading(false)
    }
  }, [videoUrl])

  // Initial transcription on mount.
  useEffect(() => {
    void runTranscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLanguageChange = useCallback(
    async (next: string) => {
      setLanguage(next)
      setError(null)
      if (!transcript) return

      const cached = translations.current.get(next)
      if (cached !== undefined) {
        setDisplayText(cached || 'متنی برای نمایش وجود ندارد.')
        return
      }

      setLoading(true)
      try {
        const { data, error: fnError } = await supabase.functions.invoke<TranscriptResponse>(
          'video-transcript',
          { body: { transcript, targetLanguage: next } },
        )
        if (fnError) throw new Error(fnError.message)
        if (data?.error) throw new Error(data.error)
        const translated = (data?.translatedText ?? '').trim()
        translations.current.set(next, translated)
        setDisplayText(translated || 'ترجمه‌ای دریافت نشد.')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'خطا در ترجمه')
      } finally {
        setLoading(false)
      }
    },
    [transcript],
  )

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#07080a]/95 backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <span className="text-sm font-semibold text-zinc-100">متن فیلم</span>
        <div className="flex items-center gap-2">
          <Select value={language} onValueChange={handleLanguageChange} disabled={!transcript || loading}>
            <SelectTrigger className="h-8 w-[130px] border-white/15 bg-white/[0.04] text-xs text-zinc-200">
              <SelectValue placeholder="زبان" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value} className="text-xs">
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن متن"
            title="بستن"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/60 text-zinc-200 transition hover:border-rose-300/40 hover:bg-rose-500/20 hover:text-rose-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            <span className="text-sm">در حال پردازش…</span>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="max-w-sm text-sm text-rose-300">{error}</p>
            <button
              type="button"
              onClick={() => void runTranscribe()}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.08]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              تلاش دوباره
            </button>
          </div>
        ) : (
          <p
            dir={isRtl ? 'rtl' : 'ltr'}
            className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-200"
          >
            {displayText}
          </p>
        )}
      </div>
    </div>
  )
}

export default TranscriptPanel
