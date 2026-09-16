import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@4'
import { authenticate } from '../_shared/core/auth.ts'
import { getServiceClient } from '../_shared/core/supabase.ts'
import { rateLimit } from '../_shared/core/ratelimit.ts'
import { fetchBoundedStorageObject, MediaFetchError } from '../_shared/core/safe-media-fetch.ts'
import {
  decodedBase64Size,
  MAX_MEDIA_BYTES,
  MAX_TRANSCRIPT_CHARS,
  parseOwnedTranscriptMedia,
  readBoundedRequestText,
  RequestBodyTooLargeError,
  TRANSCRIPT_DAILY_QUOTA,
  TRANSCRIPT_FETCH_TIMEOUT_MS,
  TRANSCRIPT_RATE_LIMIT,
  TRANSCRIPT_WINDOW_MS,
} from './security.ts'

const GATEWAY = 'https://ai.gateway.lovable.dev/v1'

const BodySchema = z.object({
  videoUrl: z.string().max(4096).optional(),
  storagePath: z.string().min(1).max(4096).optional(),
  // Raw audio bytes (base64) to transcribe directly — used when the caller only
  // has a browser blob: URL that the server cannot fetch.
  audioBase64: z.string().min(1).max(Math.ceil(MAX_MEDIA_BYTES * 4 / 3) + 128).optional(),
  mimeType: z.string().min(1).max(128).optional(),
  // When provided, the function only translates the supplied transcript.
  transcript: z.string().min(1).max(MAX_TRANSCRIPT_CHARS).optional(),
  targetLanguage: z.string().min(1).max(64).optional(),
}).refine(
  (v) => Boolean(v.videoUrl || v.storagePath || v.audioBase64 || v.transcript),
  { message: 'videoUrl, storagePath, audioBase64 or transcript is required' },
)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

type MediaExtension = 'flac' | 'mp3' | 'mp4' | 'mpeg' | 'mpga' | 'm4a' | 'ogg' | 'wav' | 'webm'

const SUPPORTED_EXTENSIONS = new Set<MediaExtension>([
  'flac',
  'mp3',
  'mp4',
  'mpeg',
  'mpga',
  'm4a',
  'ogg',
  'wav',
  'webm',
])

function inferMediaExtension(sourceUrl: string, contentType: string | null): MediaExtension {
  const cleanContentType = (contentType ?? '').split(';')[0].trim().toLowerCase()
  if (cleanContentType.includes('webm')) return 'webm'
  if (cleanContentType.includes('mpeg')) return 'mpeg'
  if (cleanContentType.includes('mpga')) return 'mpga'
  if (cleanContentType.includes('mp3')) return 'mp3'
  if (cleanContentType.includes('m4a')) return 'm4a'
  if (cleanContentType.includes('mp4')) return 'mp4'
  if (cleanContentType.includes('ogg')) return 'ogg'
  if (cleanContentType.includes('wav')) return 'wav'
  if (cleanContentType.includes('flac')) return 'flac'

  try {
    const path = new URL(sourceUrl).pathname.toLowerCase()
    const match = path.match(/\.([a-z0-9]+)$/)
    const ext = match?.[1] as MediaExtension | undefined
    if (ext && SUPPORTED_EXTENSIONS.has(ext)) return ext
  } catch {
    // Fall through to the safest default below.
  }

  return 'mp4'
}

function transcriptionMimeType(ext: MediaExtension): string {
  if (ext === 'webm') return 'audio/webm'
  if (ext === 'mp3') return 'audio/mpeg'
  if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4'
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'ogg') return 'audio/ogg'
  if (ext === 'flac') return 'audio/flac'
  return `audio/${ext}`
}

type TranscriptWord = { text: string; lowConfidence: boolean; confidence: number }

// Below this confidence a word is flagged as a possible pronunciation issue.
const LOW_CONFIDENCE_THRESHOLD = 0.55

type LogProb = { token?: string; logprob?: number }

/** Group raw STT tokens into display words, flagging low-confidence ones. */
function buildWords(logprobs: LogProb[]): TranscriptWord[] {
  const words: TranscriptWord[] = []
  let currentText = ''
  let currentMinConf = 1

  const flush = () => {
    const trimmed = currentText.trim()
    if (trimmed) {
      words.push({
        text: trimmed,
        confidence: currentMinConf,
        lowConfidence: currentMinConf < LOW_CONFIDENCE_THRESHOLD,
      })
    }
    currentText = ''
    currentMinConf = 1
  }

  for (const lp of logprobs) {
    const token = lp.token ?? ''
    if (!token) continue
    const conf = typeof lp.logprob === 'number' ? Math.exp(lp.logprob) : 1
    // A leading space/newline marks the start of a new word.
    if (/^\s/.test(token) && currentText.trim()) flush()
    currentText += token
    currentMinConf = Math.min(currentMinConf, conf)
  }
  flush()
  return words
}

async function transcribeVideo(
  apiKey: string,
  videoBytes: Blob,
  sourceUrl: string,
  contentType: string | null,
): Promise<{ transcript: string; words: TranscriptWord[] }> {
  const form = new FormData()
  form.append('model', 'openai/gpt-4o-mini-transcribe')
  // The STT provider infers the container from the filename extension. Do not
  // rename WebM/MP4 bytes to another extension; that makes valid files look
  // corrupted or unsupported upstream.
  const ext = inferMediaExtension(sourceUrl, contentType)
  const audioBlob = new Blob([await videoBytes.arrayBuffer()], { type: transcriptionMimeType(ext) })
  form.append('file', audioBlob, `film.${ext}`)
  // Request per-token confidence so we can flag possible mispronunciations.
  form.append('response_format', 'json')
  form.append('include[]', 'logprobs')

  const res = await fetch(`${GATEWAY}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const isInvalidMedia = res.status === 400 && /corrupted|unsupported|invalid_value/i.test(text)
    const err = new Error(
      isInvalidMedia
        ? 'No supported speech audio track was found in this film.'
        : `Transcription failed: ${res.status} ${text}`,
    )
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }

  const data = await res.json().catch(() => null) as
    | { text?: string; logprobs?: LogProb[] }
    | null
  const transcript = (data?.text ?? '').trim()
  const words = Array.isArray(data?.logprobs) ? buildWords(data!.logprobs) : []
  return { transcript, words }
}

async function translateText(
  apiKey: string,
  text: string,
  targetLanguage: string,
): Promise<string> {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        {
          role: 'system',
          content:
            'You are a professional translator. Translate the user text into the requested target language. ' +
            'Return ONLY the translated text with no quotes, notes, or explanations. Preserve line breaks.',
        },
        {
          role: 'user',
          content: `Target language: ${targetLanguage}\n\nText:\n${text}`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const t = await res.text().catch(() => '')
    const err = new Error(`Translation failed: ${res.status} ${t}`)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }

  const data = await res.json().catch(() => null) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null
  return (data?.choices?.[0]?.message?.content ?? '').trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const auth = await authenticate(req)
    if (!auth) return json({ error: 'Unauthorized' }, 401)
    if (!rateLimit(`video-transcript:${auth.userId}`, TRANSCRIPT_RATE_LIMIT, TRANSCRIPT_WINDOW_MS)) {
      return json({ error: 'Too many requests. Please try again shortly.' }, 429)
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!apiKey) return json({ error: 'LOVABLE_API_KEY is not configured' }, 500)

    let rawBody: string
    try {
      rawBody = await readBoundedRequestText(req)
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) return json({ error: error.message }, 413)
      throw error
    }
    if (!rawBody) return json({ error: 'JSON body required' }, 400)
    let body: unknown
    try { body = JSON.parse(rawBody) } catch { return json({ error: 'Invalid JSON body' }, 400) }
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().formErrors.join(', ') || 'Invalid request' }, 400)
    }
    const { videoUrl, storagePath, audioBase64, mimeType, transcript: providedTranscript, targetLanguage } = parsed.data

    const service = getServiceClient()
    const { data: quotaGranted, error: quotaError } = await service.rpc('claim_video_transcript_quota', {
      _user_id: auth.userId,
      _daily_limit: TRANSCRIPT_DAILY_QUOTA,
    })
    if (quotaError) return json({ error: 'Transcript quota is temporarily unavailable' }, 503)
    if (quotaGranted !== true) return json({ error: 'Daily transcript quota reached' }, 429)

    // Translate-only path: caller already has the transcript cached.
    if (providedTranscript) {
      if (!targetLanguage) return json({ transcript: providedTranscript })
      const translatedText = await translateText(apiKey, providedTranscript, targetLanguage)
      return json({ transcript: providedTranscript, translatedText, targetLanguage })
    }

    let videoBytes: Blob
    let sourceUrl: string
    let contentType: string | null

    if (audioBase64) {
      // Direct raw-audio path (e.g. a browser blob: URL the server can't fetch).
      if (decodedBase64Size(audioBase64) > MAX_MEDIA_BYTES) {
        return json({ error: 'Audio is too large to transcribe.' }, 413)
      }
      let bytes: Uint8Array
      try {
        const clean = audioBase64.includes(',') ? audioBase64.split(',').pop()! : audioBase64
        const bin = atob(clean)
        bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      } catch {
        return json({ error: 'Invalid audioBase64 payload.' }, 400)
      }
      contentType = mimeType ?? 'audio/wav'
      const audioBuffer = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(audioBuffer).set(bytes)
      videoBytes = new Blob([audioBuffer], { type: contentType })
      // Give the STT format-inference a filename hint via the mime type.
      sourceUrl = `audio.${contentType.includes('mpeg') || contentType.includes('mp3') ? 'mp3' : contentType.includes('webm') ? 'webm' : contentType.includes('mp4') || contentType.includes('m4a') ? 'm4a' : contentType.includes('ogg') ? 'ogg' : 'wav'}`
      if (videoBytes.size < 1024) {
        return json({ error: 'The audio is empty or too small to transcribe.' }, 400)
      }
    } else {
      const storageOrigin = new URL(Deno.env.get('SUPABASE_URL') ?? '').origin
      const owned = parseOwnedTranscriptMedia(videoUrl ?? storagePath!, storageOrigin, auth.userId)
      if (!owned) return json({ error: 'Media must be an authenticated-user-owned storage object' }, 403)
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      if (!serviceKey) return json({ error: 'Storage service is not configured' }, 500)
      const fetched = await fetchBoundedStorageObject({
        origin: storageOrigin,
        serviceKey,
        ref: owned,
        maxBytes: MAX_MEDIA_BYTES,
        timeoutMs: TRANSCRIPT_FETCH_TIMEOUT_MS,
      })
      contentType = fetched.contentType
      if (contentType && !/^(audio|video)\//i.test(contentType)) {
        return json({ error: 'Storage object is not supported audio or video' }, 415)
      }
      const mediaBuffer = new ArrayBuffer(fetched.bytes.byteLength)
      new Uint8Array(mediaBuffer).set(fetched.bytes)
      videoBytes = new Blob([mediaBuffer], { type: contentType ?? 'video/mp4' })
      sourceUrl = owned.path
      if (videoBytes.size < 1024) {
        return json({ error: 'The video file is empty or too small to transcribe.' }, 400)
      }
    }

    const { transcript, words } = await transcribeVideo(
      apiKey,
      videoBytes,
      sourceUrl,
      contentType,
    )
    if (!transcript) {
      return json({ error: 'No speech was detected in this film.' }, 200)
    }

    let translatedText: string | undefined
    if (targetLanguage) {
      translatedText = await translateText(apiKey, transcript, targetLanguage)
    }

    return json({ transcript, words, translatedText, targetLanguage })
  } catch (e) {
    if (e instanceof MediaFetchError) return json({ error: e.message }, e.status)
    const status = (e as Error & { status?: number }).status
    const message = e instanceof Error ? e.message : 'Unexpected error'
    if (status === 402) return json({ error: 'AI credits exhausted. Please add credits.' }, 402)
    if (status === 429) return json({ error: 'Too many requests. Please try again shortly.' }, 429)
    if (status === 400) {
      const responseStatus = message.startsWith('No supported speech audio track') ? 200 : 400
      return json({ error: message }, responseStatus)
    }
    return json({ error: message }, 500)
  }
})
