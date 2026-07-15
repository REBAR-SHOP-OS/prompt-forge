import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Loader2, ScanText, RotateCcw, X, Languages } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { proxiedVideoUrl } from '@/modules/generator-ui/lib/proxiedVideoUrl'
import { extractNarration } from '@/modules/generator-ui/lib/narration'
import { extractAudioAsBase64 } from '@/modules/generator-ui/lib/extractAudio'
import {
  reviewNarration,
  type NarrationReviewResult,
  type TimestampedWord,
} from '@/modules/generator-ui/lib/narrationReview'

export interface NarrationReviewPanelProps {
  open: boolean
  onClose: () => void
  videoStoragePath: string | null
  /** Authoritative narration lines (one per newline). Overrides extraction from prompt. */
  narrationText: string | null
  prompt: string | null
}

function fmtSec(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

type FnResponse = {
  transcript?: string
  words?: TimestampedWord[]
  transcript_translated?: string
  translate_to?: string
  error?: string
  code?: string
  translations?: string[]
}

type ReviewBody =
  | { videoUrl: string; translate_to?: string }
  | { audioBase64: string; mimeType: 'audio/mpeg'; translate_to?: string }

// Mirrors TranscriptPanel's LOCAL_AUDIO_THRESHOLD_BYTES.
const LOCAL_AUDIO_THRESHOLD_BYTES = 10 * 1024 * 1024

export const DISPLAY_LANGUAGES: { code: string; label: string; nativeLabel: string }[] = [
  { code: 'English',          label: 'English',      nativeLabel: 'English' },
  { code: 'Persian/Farsi',    label: 'Persian',      nativeLabel: 'فارسی' },
  { code: 'Arabic',           label: 'Arabic',       nativeLabel: 'العربية' },
  { code: 'Turkish',          label: 'Turkish',      nativeLabel: 'Türkçe' },
  { code: 'Spanish',          label: 'Spanish',      nativeLabel: 'Español' },
  { code: 'French',           label: 'French',       nativeLabel: 'Français' },
  { code: 'German',           label: 'German',       nativeLabel: 'Deutsch' },
  { code: 'Chinese',          label: 'Chinese',      nativeLabel: '中文' },
]

export function NarrationReviewPanel({
  open,
  onClose,
  videoStoragePath,
  narrationText,
  prompt,
}: NarrationReviewPanelProps) {
  const [loading, setLoading] = useState(false)
  const [loadingStage, setLoadingStage] = useState<'transcribing' | 'extracting' | 'translating'>('transcribing')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<NarrationReviewResult | null>(null)
  const [originalTranscript, setOriginalTranscript] = useState<string>('')

  // Translation state
  const [translateTo, setTranslateTo] = useState<string | null>(null)
  const [translatedTexts, setTranslatedTexts] = useState<Map<string, string>>(new Map())
  const [translating, setTranslating] = useState(false)
  const [translationError, setTranslationError] = useState<string | null>(null)
  // Ref to abort in-flight translation if language changes again
  const translationAbortRef = useRef<AbortController | null>(null)

  const expectedLines = narrationText
    ? narrationText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    : extractNarration(prompt)

  // Collect all display strings that need translation for the current result.
  function collectTranslatableTexts(r: NarrationReviewResult, oTranscript: string): string[] {
    const texts: string[] = []
    if (oTranscript) texts.push(oTranscript)
    for (const issue of r.issues) {
      if (issue.text) texts.push(issue.text)
      if (issue.suggestion) texts.push(issue.suggestion)
    }
    return texts
  }

  async function applyTranslation(r: NarrationReviewResult, oTranscript: string, language: string) {
    const texts = collectTranslatableTexts(r, oTranscript)
    if (texts.length === 0) return

    translationAbortRef.current?.abort()
    const abort = new AbortController()
    translationAbortRef.current = abort

    setTranslating(true)
    setTranslationError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<FnResponse>(
        'narration-review',
        { body: { translate_texts: texts, target_language: language } },
      )
      if (abort.signal.aborted) return
      if (fnError) throw new Error(fnError.message)
      const translations = data?.translations
      if (!Array.isArray(translations) || translations.length !== texts.length) {
        throw new Error('Unexpected translation response')
      }
      const map = new Map<string, string>()
      texts.forEach((orig, i) => { map.set(orig, translations[i]) })
      setTranslatedTexts(map)
    } catch (e) {
      if (abort.signal.aborted) return
      setTranslationError(e instanceof Error ? e.message : 'Translation failed.')
    } finally {
      if (!abort.signal.aborted) setTranslating(false)
    }
  }

  const runReview = useCallback(async () => {
    if (!videoStoragePath) {
      setResult({ status: 'no-video', issues: [], matchPercent: 0, transcript: '' })
      setOriginalTranscript('')
      return
    }
    if (expectedLines.length === 0) {
      setResult({ status: 'no-narration', issues: [], matchPercent: 100, transcript: '' })
      setOriginalTranscript('')
      return
    }

    setLoading(true)
    setLoadingStage('transcribing')
    setError(null)
    setResult(null)
    setOriginalTranscript('')
    setTranslatedTexts(new Map())

    try {
      let fetchUrl = videoStoragePath
      try { fetchUrl = await proxiedVideoUrl(videoStoragePath) } catch { /* fall back */ }

      // Mirror TranscriptPanel: pre-fetch blob to check size; extract audio locally
      // for large videos so the edge function never receives a payload > 18 MB.
      let body: ReviewBody = { videoUrl: fetchUrl }
      if (translateTo) (body as ReviewBody & { translate_to?: string }).translate_to = translateTo
      let isLargeVideo = false
      try {
        const videoRes = await fetch(fetchUrl)
        if (!videoRes.ok) throw new Error(`Could not load video (${videoRes.status})`)
        const blob = await videoRes.blob()
        if (blob.size > LOCAL_AUDIO_THRESHOLD_BYTES) {
          isLargeVideo = true
          setLoadingStage('extracting')
          const audioBase64 = await extractAudioAsBase64(blob)
          body = { audioBase64, mimeType: 'audio/mpeg', ...(translateTo ? { translate_to: translateTo } : {}) }
          setLoadingStage('transcribing')
        }
      } catch (e) {
        if (isLargeVideo) {
          throw new Error(
            `This video is too large to analyze directly. ${e instanceof Error ? e.message : 'Audio extraction failed.'}`,
          )
        }
        console.warn('Could not inspect video size locally; using server URL path:', e)
      }

      const { data, error: fnError } = await supabase.functions.invoke<FnResponse>(
        'narration-review',
        { body },
      )

      if (fnError) throw new Error(fnError.message)
      if (data?.code === 'MEDIA_TOO_LARGE') {
        throw new Error(
          'Video is too large to analyze. Try again — audio will be extracted locally on retry.',
        )
      }
      if (data?.error && !data.transcript) throw new Error(data.error)

      const transcript = (data?.transcript ?? '').trim()
      const words: TimestampedWord[] = Array.isArray(data?.words) ? data!.words : []

      const reviewed = reviewNarration(expectedLines, words, transcript)
      setResult(reviewed)
      setOriginalTranscript(transcript)

      // If server already translated (translate_to passed in body) seed the map.
      if (data?.transcript_translated && translateTo) {
        const newMap = new Map<string, string>()
        newMap.set(transcript, data.transcript_translated)
        setTranslatedTexts(newMap)
        // Still need to translate issue texts — kick off second-pass translation.
        if (reviewed.issues.length > 0) {
          void applyTranslation(reviewed, transcript, translateTo)
        }
      } else if (translateTo && transcript) {
        void applyTranslation(reviewed, transcript, translateTo)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed. Please try again.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoStoragePath, narrationText, prompt, translateTo])

  useEffect(() => {
    if (open && !result && !loading && !error) {
      void runReview()
    }
    if (!open) {
      setResult(null)
      setError(null)
      setOriginalTranscript('')
      setTranslatedTexts(new Map())
      setTranslationError(null)
      setTranslateTo(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // When the user changes translation language after a review already ran,
  // trigger translation without re-transcribing.
  const prevTranslateToRef = useRef<string | null>(null)
  useEffect(() => {
    if (!result || !open || loading) return
    if (translateTo === prevTranslateToRef.current) return
    prevTranslateToRef.current = translateTo
    if (translateTo === null) {
      setTranslatedTexts(new Map())
      setTranslationError(null)
      return
    }
    void applyTranslation(result, originalTranscript, translateTo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translateTo])

  if (!open) return null

  const loadingLabel =
    loadingStage === 'extracting' ? 'Extracting audio from film…'
    : loadingStage === 'translating' ? 'Translating…'
    : 'Listening to the film narration…'

  // Resolve display text: show translated version if available, else original.
  const t = (orig: string | undefined) => (orig && translatedTexts.has(orig) ? translatedTexts.get(orig)! : orig ?? '')
  const displayTranscript = t(originalTranscript)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Narration review"
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1012] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center gap-2.5">
          <ScanText className="h-4 w-4 shrink-0 text-violet-300" aria-hidden="true" />
          <h2 className="flex-1 text-sm font-semibold text-zinc-100">Narration Review</h2>

          {/* Language selector — visible once a review is done */}
          {result && result.status !== 'no-video' && result.status !== 'no-narration' && (
            <div className="relative flex items-center gap-1">
              <Languages className="h-3 w-3 text-zinc-500 pointer-events-none" aria-hidden="true" />
              <select
                value={translateTo ?? ''}
                onChange={(e) => setTranslateTo(e.target.value || null)}
                aria-label="Display language"
                className="appearance-none bg-transparent text-[11px] text-zinc-400 cursor-pointer hover:text-zinc-200 focus:outline-none pr-1"
              >
                <option value="">Original</option>
                {DISPLAY_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.nativeLabel}
                  </option>
                ))}
              </select>
              {translating && <Loader2 className="h-3 w-3 animate-spin text-zinc-500" aria-hidden="true" />}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close narration review"
            className="grid h-6 w-6 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-white/20 hover:text-zinc-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Expected narration */}
        {expectedLines.length > 0 && (
          <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Expected narration</p>
            <p className="text-xs leading-5 text-zinc-300">{expectedLines.join(' ')}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2.5 py-6 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
            <span>{loadingLabel}</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
              <p className="text-xs leading-5 text-rose-200">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => void runReview()}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Retry
            </button>
          </div>
        )}

        {/* Translation error (non-fatal) */}
        {!loading && !error && translationError && (
          <div className="mb-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-2.5 text-[11px] text-amber-200">
            Translation unavailable: {translationError}
          </div>
        )}

        {/* Results */}
        {!loading && !error && result && (
          <div className="space-y-3">
            {result.status === 'no-video' && (
              <p className="text-xs text-zinc-500">No rendered video yet. Generate this project to review its narration.</p>
            )}

            {result.status === 'no-narration' && (
              <p className="text-xs text-zinc-500">No narration found in this project's prompt. Narration lines appear here when the scene includes spoken dialogue or a narration line.</p>
            )}

            {result.status === 'no-speech' && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                <p className="text-xs leading-5 text-amber-200">No speech was detected in this film. Make sure the video has an audio track with spoken narration.</p>
              </div>
            )}

            {result.status === 'pass' && (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06] p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold text-emerald-200">Narration looks good</p>
                  <p className="mt-0.5 text-[11px] text-emerald-300/70">
                    {result.matchPercent}% match — no significant problems detected.
                  </p>
                </div>
              </div>
            )}

            {result.status === 'issues' && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
                  <p className="text-[11px] font-semibold text-amber-200">
                    {result.issues.length} issue{result.issues.length !== 1 ? 's' : ''} found · {result.matchPercent}% match
                  </p>
                </div>

                <ul className="space-y-2">
                  {result.issues.map((issue, i) => (
                    <li
                      key={i}
                      className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3 space-y-1.5"
                    >
                      {/* Time range badge */}
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-zinc-300 tabular-nums">
                          {fmtSec(issue.startSeconds)} – {fmtSec(issue.endSeconds)}
                        </span>
                        {issue.text ? (
                          <span className="truncate text-[11px] italic text-zinc-400">
                            "{t(issue.text)}"
                          </span>
                        ) : null}
                      </div>
                      {/* Problem description (always in original — contains cited words) */}
                      <p className="text-xs leading-5 text-amber-100">{issue.problem}</p>
                      {/* Suggestion */}
                      {issue.suggestion ? (
                        <p className="text-[11px] text-zinc-400">
                          <span className="font-medium text-zinc-300">Should be: </span>
                          <span className="italic">"{t(issue.suggestion)}"</span>
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => void runReview()}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-white/20 hover:text-zinc-100"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  Re-check
                </button>
              </div>
            )}

            {/* Transcript footer */}
            {displayTranscript ? (
              <details className="group mt-2">
                <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-widest text-zinc-600 transition hover:text-zinc-400 select-none">
                  On-film transcript{translateTo ? ` (${translateTo})` : ''} ▾
                </summary>
                <p className="mt-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-[11px] leading-5 text-zinc-400">
                  {displayTranscript}
                </p>
              </details>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
