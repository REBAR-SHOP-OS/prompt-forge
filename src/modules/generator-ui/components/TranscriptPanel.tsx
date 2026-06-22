import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, Volume2, X } from 'lucide-react'
import { toast } from 'sonner'
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
  { value: ORIGINAL, label: 'Original' },
  { value: 'Persian', label: 'Persian', rtl: true },
  { value: 'English', label: 'English' },
  { value: 'Arabic', label: 'Arabic', rtl: true },
  { value: 'French', label: 'French' },
  { value: 'Spanish', label: 'Spanish' },
  { value: 'German', label: 'German' },
  { value: 'Turkish', label: 'Turkish' },
]

type TranscriptWord = { text: string; lowConfidence: boolean; confidence: number }

type TranscriptResponse = {
  transcript?: string
  words?: TranscriptWord[]
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
  const [words, setWords] = useState<TranscriptWord[]>([])
  const [displayText, setDisplayText] = useState<string>('')
  const [language, setLanguage] = useState<string>(ORIGINAL)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pronouncing, setPronouncing] = useState<number | null>(null)
  const [playingWord, setPlayingWord] = useState<number | null>(null)
  // Cache of translations keyed by language value.
  const translations = useRef<Map<string, string>>(new Map())
  // Cache of generated pronunciation audio keyed by normalized word.
  const audioCache = useRef<Map<string, string>>(new Map())
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const showWords = words.length > 0
  const hasLowConfidence = showWords && words.some((w) => w.lowConfidence)
  const showTranslation = language !== ORIGINAL
  const translationLabel = LANGUAGES.find((l) => l.value === language)?.label ?? 'Translation'

  const playPronunciation = useCallback(async (rawWord: string, index: number) => {
    // Strip surrounding punctuation: "Stirrup," -> "Stirrup".
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
    if (cached) {
      playUrl(cached)
      return
    }

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

  // Clean up audio + object URLs on unmount.
  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause()
      for (const url of audioCache.current.values()) URL.revokeObjectURL(url)
      audioCache.current.clear()
    }
  }, [])

  const isRtl =
    language === ORIGINAL
      ? /[\u0600-\u06FF]/.test(displayText)
      : Boolean(LANGUAGES.find((l) => l.value === language)?.rtl)

  const runTranscribe = useCallback(async () => {
    if (!videoUrl) {
      setError('Video file is not available.')
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
      setWords(Array.isArray(data?.words) ? data!.words : [])
      translations.current.clear()
      translations.current.set(ORIGINAL, text)
      setLanguage(ORIGINAL)
      setDisplayText(text || 'No speech detected in this video.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to transcribe.')
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
        setDisplayText(cached || 'No text to display.')
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
        setDisplayText(translated || 'No translation received.')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to translate.')
      } finally {
        setLoading(false)
      }
    },
    [transcript],
  )

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#07080a]/95 backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <span className="text-sm font-semibold text-zinc-100">Transcript</span>
        <div className="flex items-center gap-2">
          <Select value={language} onValueChange={handleLanguageChange} disabled={!transcript || loading}>
            <SelectTrigger className="h-8 w-[130px] border-white/15 bg-white/[0.04] text-xs text-zinc-200">
              <SelectValue placeholder="Language" />
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
            aria-label="Close transcript"
            title="Close"
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
            <span className="text-sm">Processing…</span>
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
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {hasLowConfidence ? (
              <p className="flex items-center gap-2 text-[11px] text-amber-300/90">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                Highlighted words may be mispronounced — click one to hear the correct pronunciation.
              </p>
            ) : null}
            <p
              dir={isRtl ? 'rtl' : 'ltr'}
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
                : displayText}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default TranscriptPanel
