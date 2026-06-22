import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3'

const GATEWAY = 'https://ai.gateway.lovable.dev/v1'

const BodySchema = z.object({
  videoUrl: z.string().url().optional(),
  storagePath: z.string().min(1).optional(),
  // When provided, the function only translates the supplied transcript.
  transcript: z.string().min(1).optional(),
  targetLanguage: z.string().min(1).max(64).optional(),
}).refine(
  (v) => Boolean(v.videoUrl || v.storagePath || v.transcript),
  { message: 'videoUrl, storagePath or transcript is required' },
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
    const apiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!apiKey) return json({ error: 'LOVABLE_API_KEY is not configured' }, 500)

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().formErrors.join(', ') || 'Invalid request' }, 400)
    }
    const { videoUrl, storagePath, transcript: providedTranscript, targetLanguage } = parsed.data

    // Translate-only path: caller already has the transcript cached.
    if (providedTranscript) {
      if (!targetLanguage) return json({ transcript: providedTranscript })
      const translatedText = await translateText(apiKey, providedTranscript, targetLanguage)
      return json({ transcript: providedTranscript, translatedText, targetLanguage })
    }

    const sourceUrl = videoUrl ?? storagePath!
    const videoRes = await fetch(sourceUrl)
    if (!videoRes.ok) {
      return json({ error: `Could not load video (${videoRes.status})` }, 502)
    }
    const videoBytes = await videoRes.blob()
    if (videoBytes.size < 1024) {
      return json({ error: 'The video file is empty or too small to transcribe.' }, 400)
    }

    const transcript = await transcribeVideo(
      apiKey,
      videoBytes,
      sourceUrl,
      videoRes.headers.get('content-type'),
    )
    if (!transcript) {
      return json({ error: 'No speech was detected in this film.' }, 200)
    }

    let translatedText: string | undefined
    if (targetLanguage) {
      translatedText = await translateText(apiKey, transcript, targetLanguage)
    }

    return json({ transcript, translatedText, targetLanguage })
  } catch (e) {
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
