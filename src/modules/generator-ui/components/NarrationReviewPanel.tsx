import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, FileAudio, Loader2, RotateCcw, ScanText, X } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { proxiedVideoUrl } from '@/modules/generator-ui/lib/proxiedVideoUrl'
import { extractAudioAsBase64 } from '@/modules/generator-ui/lib/extractAudio'
import {
  reviewNarration,
  reviewVerdictTitle,
  reviewVerdictDetail,
  formatNarrationTimestamp,
  type TimestampedWord,
  type NarrationReviewResult,
} from '@/modules/generator-ui/lib/narrationReview'

export interface NarrationReviewPanelProps {
  open: boolean
  onClose: () => void
  videoStoragePath: string | null
  /** Authoritative narration for this Final Film (from its metadata, not the prompt). */
  expectedNarration?: string | null
}

type FnResponse = {
  transcript?: string
  words?: TimestampedWord[]
  error?: string
  code?: string
}

type TranscriptionBody =
  | { videoUrl: string }
  | { audioBase64: string; mimeType: 'audio/mpeg' }

type Result =
  | { status: 'transcript'; transcript: string; words: TimestampedWord[] }
  | { status: 'no-video' }
  | { status: 'no-speech' }

const LOCAL_AUDIO_THRESHOLD_BYTES = 10 * 1024 * 1024
const TRANSCRIPTION_TIMEOUT_MS = 60_000

async function edgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  try {
    const context = (error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } })?.context
    if (context && typeof context.json === 'function') {
      const body = await context.json() as { error?: string } | null
      if (body?.error) return body.error
    }
    if (context && typeof context.text === 'function') {
      const text = await context.text()
      try {
        const body = JSON.parse(text) as { error?: string }
        if (body?.error) return body.error
      } catch { /* response was not JSON */ }
      if (text) return text
    }
  } catch { /* use the SDK error below */ }
  return error instanceof Error && error.message ? error.message : fallback
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error('Transcription timed out. Please retry.')),
      timeoutMs,
    )
    promise.then(
      (value) => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Could not transcribe this film.'
  if (/timed out/i.test(message)) return 'Transcription timed out. Please retry.'
  if (/Could not load video \((401|403)\)/i.test(message)) {
    return 'The film URL expired or you no longer have access. Retry to refresh it.'
  }
  if (/Could not load video \(404\)|Invalid video URL/i.test(message)) {
    return 'The film URL is invalid or the file is no longer available.'
  }
  if (/Failed to fetch|NetworkError|network request failed/i.test(message)) {
    return 'Network error while loading the film. Check your connection and retry.'
  }
  return message
}

export function NarrationReviewPanel({
  open,
  onClose,
  videoStoragePath,
  expectedNarration,
}: NarrationReviewPanelProps) {
  const [loading, setLoading] = useState(false)
  const [loadingStage, setLoadingStage] = useState<'loading' | 'extracting' | 'transcribing'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const requestIdRef = useRef(0)
  const fetchAbortRef = useRef<AbortController | null>(null)

  const cancelActiveRequest = useCallback(() => {
    requestIdRef.current += 1
    fetchAbortRef.current?.abort()
    fetchAbortRef.current = null
  }, [])

  const runTranscription = useCallback(async () => {
    cancelActiveRequest()
    const requestId = requestIdRef.current

    setError(null)
    setResult(null)
    if (!videoStoragePath) {
      setLoading(false)
      setResult({ status: 'no-video' })
      return
    }

    const abort = new AbortController()
    fetchAbortRef.current = abort
    setLoading(true)
    setLoadingStage('loading')

    try {
      const fetchUrl = await withTimeout(proxiedVideoUrl(videoStoragePath), TRANSCRIPTION_TIMEOUT_MS)
      if (abort.signal.aborted || requestId !== requestIdRef.current) return

      const videoResponse = await withTimeout(
        fetch(fetchUrl, { signal: abort.signal }),
        TRANSCRIPTION_TIMEOUT_MS,
      )
      if (!videoResponse.ok) throw new Error(`Could not load video (${videoResponse.status})`)

      const videoBlob = await withTimeout(videoResponse.blob(), TRANSCRIPTION_TIMEOUT_MS)
      if (abort.signal.aborted || requestId !== requestIdRef.current) return

      let body: TranscriptionBody = { videoUrl: fetchUrl }
      if (videoBlob.size > LOCAL_AUDIO_THRESHOLD_BYTES) {
        setLoadingStage('extracting')
        const audioBase64 = await withTimeout(
          extractAudioAsBase64(videoBlob),
          TRANSCRIPTION_TIMEOUT_MS,
        )
        if (abort.signal.aborted || requestId !== requestIdRef.current) return
        body = { audioBase64, mimeType: 'audio/mpeg' }
      }

      setLoadingStage('transcribing')
      const invocation = supabase.functions.invoke<FnResponse>('narration-review', { body })
      const { data, error: fnError } = await withTimeout(invocation, TRANSCRIPTION_TIMEOUT_MS)
      if (abort.signal.aborted || requestId !== requestIdRef.current) return

      if (fnError) {
        throw new Error(await edgeFunctionErrorMessage(fnError, 'Transcription failed.'))
      }
      if (data?.code === 'NO_SPEECH' || /no supported speech audio track/i.test(data?.error ?? '')) {
        setResult({ status: 'no-speech' })
        return
      }
      if (data?.error) throw new Error(data.error)

      const transcript = (data?.transcript ?? '').trim()
      const words = (data?.words ?? []) as TimestampedWord[]
      setResult(transcript
        ? { status: 'transcript', transcript, words }
        : { status: 'no-speech' })
    } catch (caught) {
      if (abort.signal.aborted || requestId !== requestIdRef.current) return
      setError(friendlyError(caught))
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
        fetchAbortRef.current = null
      }
    }
  }, [cancelActiveRequest, videoStoragePath])

  useEffect(() => {
    if (open) {
      void runTranscription()
    } else {
      cancelActiveRequest()
      setLoading(false)
      setError(null)
      setResult(null)
    }
    return cancelActiveRequest
  }, [open, runTranscription, cancelActiveRequest])

  const close = () => {
    cancelActiveRequest()
    onClose()
  }

  if (!open) return null

  const loadingLabel =
    loadingStage === 'extracting'
      ? 'Extracting audio from the film…'
      : loadingStage === 'transcribing'
        ? 'Converting the film speech to text…'
        : 'Loading the selected film…'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Film transcript"
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      onClick={close}
    >
      <div className="absolute inset-0 bg-surface-2/80 backdrop-blur-sm" aria-hidden="true" />

      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2.5">
          <ScanText className="h-4 w-4 shrink-0 text-violet-300" aria-hidden="true" />
          <h2 className="flex-1 text-sm font-semibold text-foreground">Film transcript</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close film transcript"
            className="grid h-6 w-6 place-items-center rounded-full border border-border text-muted-foreground transition hover:border-border hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2.5 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            <span>{loadingLabel}</span>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
              <p className="text-xs leading-5 text-rose-200">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => void runTranscription()}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground/80 transition hover:border-border hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : null}

        {!loading && !error && result?.status === 'no-video' ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
            <p className="text-xs leading-5 text-amber-200">This card does not have a film file to transcribe.</p>
          </div>
        ) : null}

        {!loading && !error && result?.status === 'no-speech' ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3">
            <FileAudio className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold text-amber-200">
                {expectedNarration?.trim() ? 'Expected narration was not detected.' : 'No speech was detected in this film.'}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-amber-300/80">
                {expectedNarration?.trim()
                  ? 'The film may be silent, contain music only, or the narration was not spoken.'
                  : 'The film may be silent, contain music only, or have no supported speech audio track.'}
              </p>
            </div>
          </div>
        ) : null}

        {!loading && !error && result?.status === 'transcript' ? (() => {
          const expectedLines = (expectedNarration ?? '')
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
          const review = reviewNarration(expectedLines, result.words, result.transcript)
          const hasExpected = expectedLines.length > 0
          const verdict = reviewVerdictTitle(review)
          const isPass = review.status === 'pass'
          return (
            <section aria-label="Voice quality review" className="space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
                    isPass
                      ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200'
                      : 'border-amber-300/30 bg-amber-300/10 text-amber-200'
                  }`}
                >
                  {isPass ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />}
                  {verdict}
                </span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  {review.matchPercent}% match
                </span>
              </div>

              <p className="text-xs leading-5 text-foreground/80">{reviewVerdictDetail(review)}</p>

              {hasExpected && review.issues.length > 0 ? (
                <ul className="space-y-2">
                  {review.issues.map((issue, i) => (
                    <li
                      key={i}
                      className="rounded-xl border border-border bg-accent/30 p-3"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                          {formatNarrationTimestamp(issue.startSeconds)}–{formatNarrationTimestamp(issue.endSeconds)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            issue.kind === 'missing'
                              ? 'bg-rose-300/10 text-rose-200'
                              : issue.kind === 'extra'
                                ? 'bg-sky-300/10 text-sky-200'
                                : 'bg-amber-300/10 text-amber-200'
                          }`}
                        >
                          {issue.kind === 'missing' ? 'Missing' : issue.kind === 'extra' ? 'Extra' : 'Changed'}
                        </span>
                      </div>
                      <p className="text-xs leading-5 text-foreground/90">{issue.problem}</p>
                      {issue.suggestion ? (
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                          Should be: <span className="text-foreground/80">{issue.suggestion}</span>
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Speech heard in this film
                </p>
                <p
                  dir="auto"
                  className="rounded-xl border border-violet-300/20 bg-violet-300/[0.06] p-3 text-sm leading-6 text-foreground"
                >
                  {result.transcript}
                </p>
              </div>
            </section>
          )
        })() : null}
      </div>
    </div>
  )
}
