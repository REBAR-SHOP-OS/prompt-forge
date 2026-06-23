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

  const translateNarration = useCallback(async (lang: string) => {
    setTargetLang(lang)
    // Stop any narration playback so the next read uses the chosen version.
    if (narrAudioRef.current) narrAudioRef.current.pause()
    if (!lang) { setTranslation(null); return }
    const text = promptText.trim()
    if (!text) return
    setTranslating(true)
    setTranslation(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        translation?: string
        error?: string
      }>('translate-text', { body: { text, targetLang: lang } })
      if (fnError) throw new Error(fnError.message)
      if (data?.error) throw new Error(data.error)
      if (!data?.translation) throw new Error('No translation returned')
      setTranslation(data.translation)
    } catch {
      toast.error('Could not translate the narration.')
      setTargetLang('')
    } finally {
      setTranslating(false)
    }
  }, [promptText])



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
          Narration
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
              From prompt
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
                    <option value="">Original</option>
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
                  aria-label={narrPlaying ? 'Pause narration' : 'Read narration aloud'}
                  title={narrPlaying ? 'Pause narration' : 'Read narration aloud'}
                  className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-wait"
                >
                  {narrLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : narrPlaying ? (
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Read aloud
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
                    {TRANSLATE_LANGS.find((l) => l.code === targetLang)?.label ?? 'Translation'}
                  </p>
                  {translation}
                </div>
              ) : null}
              {/* Hidden audio element for narration read-aloud */}
              <audio ref={narrAudioRef} className="hidden" />
            </>
          ) : (
            <p className="text-sm leading-6 text-zinc-400">
              No narration detected in this card's prompt. The narration / spoken lines appear here when the scene includes a narration line or quoted dialogue.
            </p>
          )}
        </section>


        {/* 2) Narration on the film */}
        <section className="space-y-2 border-t border-white/10 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            On film
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
                <p className="text-[11px] font-medium text-zinc-300">Film voice</p>
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
              No rendered video yet — generate this card to check the spoken narration.
            </p>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Listening to the film…
            </div>
          ) : error ? (
            <div className="space-y-2">
              <p className="text-sm text-rose-300">{error}</p>
              <button
                type="button"
                onClick={() => void runTranscribe()}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.08]"
              >
                <Mic className="h-3.5 w-3.5" aria-hidden="true" /> Retry
              </button>
            </div>
          ) : transcript === null ? (
            <button
              type="button"
              onClick={() => void runTranscribe()}
              className="inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/10 px-4 py-1.5 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/20"
            >
              <Mic className="h-3.5 w-3.5" aria-hidden="true" /> Check narration on film
            </button>
          ) : (
            <>
              {lowConfWords.length > 0 ? (
                <p className="flex items-center gap-2 text-[11px] text-amber-300/90">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                  Highlighted words may be mispronounced — click one to hear the correct pronunciation.
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
                  : transcript || 'No speech detected in this film.'}
              </p>
            </>
          )}
        </section>

        {/* 3) Comparison / health check */}
        {check ? (
          <section className="space-y-2 border-t border-white/10 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Check
            </h3>
            <div
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm leading-6 ${
                check.status === 'ok'
                  ? 'border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-100'
                  : check.status === 'none'
                    ? 'border-white/10 bg-white/[0.03] text-zinc-300'
                    : 'border-amber-400/30 bg-amber-500/[0.08] text-amber-100'
              }`}
            >
              {check.status === 'ok' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : check.status === 'none' ? null : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>{check.message}</span>
            </div>

            {/* Percentage match / difference meter */}
            {check.status === 'ok' || check.status === 'mismatch' ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-medium">
                  <span className="text-emerald-300">{check.matchPercent}% match</span>
                  <span className="text-amber-300">{check.errorPercent}% different</span>
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
                  <span className="text-zinc-300">Word-by-word diff</span> — prompt vs film.
                  <span className="ml-1 text-rose-300">red = missing on film</span>,
                  <span className="ml-1 text-amber-300">amber = extra/wrong on film</span>.
                </p>
                <p dir="auto" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[14px] leading-7">
                  {check.diff.map((t, i) => (
                    <span
                      key={i}
                      className={
                        t.kind === 'missing'
                          ? 'rounded-sm bg-rose-500/15 px-0.5 text-rose-300 line-through decoration-rose-400/70'
                          : t.kind === 'extra'
                            ? 'rounded-sm bg-amber-400/15 px-0.5 text-amber-300 underline decoration-dotted decoration-amber-400/70 underline-offset-2'
                            : 'text-zinc-200'
                      }
                    >
                      {t.text}
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
