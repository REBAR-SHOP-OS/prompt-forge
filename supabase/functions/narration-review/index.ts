// narration-review: transcribe a final film with word-level timestamps and
// return the raw word list so the client can diff against expected narration.
import { authenticate } from '../_shared/core/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/core/http.ts'
import { getEnv } from '../_shared/core/env.ts'
import { z } from 'npm:zod@3'

const GATEWAY = 'https://ai.gateway.lovable.dev/v1'

// Keep the body limit generous — callers may send audioBase64 for large files.
const MAX_BODY_BYTES = 120 * 1024 * 1024

const BodySchema = z.object({
  videoUrl:    z.string().url().optional(),
  storagePath: z.string().min(1).optional(),
  audioBase64: z.string().min(1).optional(),
  mimeType:    z.string().min(1).max(128).optional(),
}).refine(
  (v) => Boolean(v.videoUrl || v.storagePath || v.audioBase64),
  { message: 'videoUrl, storagePath, or audioBase64 is required' },
)

type MediaExtension = 'flac' | 'mp3' | 'mp4' | 'mpeg' | 'mpga' | 'm4a' | 'ogg' | 'wav' | 'webm'

const SUPPORTED_EXTENSIONS = new Set<MediaExtension>([
  'flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm',
])

function inferExt(sourceUrl: string, contentType: string | null): MediaExtension {
  const ct = (contentType ?? '').split(';')[0].trim().toLowerCase()
  if (ct.includes('webm')) return 'webm'
  if (ct.includes('mp4') || ct.includes('m4a')) return 'mp4'
  if (ct.includes('mpeg') || ct.includes('mp3')) return 'mp3'
  if (ct.includes('ogg')) return 'ogg'
  if (ct.includes('wav')) return 'wav'
  if (ct.includes('flac')) return 'flac'
  try {
    const ext = new URL(sourceUrl).pathname.match(/\.([a-z0-9]+)$/)?.[1] as MediaExtension | undefined
    if (ext && SUPPORTED_EXTENSIONS.has(ext)) return ext
  } catch { /* ignore */ }
  return 'mp4'
}

function mimeFor(ext: MediaExtension): string {
  if (ext === 'webm') return 'audio/webm'
  if (ext === 'mp3') return 'audio/mpeg'
  if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4'
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'ogg') return 'audio/ogg'
  if (ext === 'flac') return 'audio/flac'
  return `audio/${ext}`
}

export type TimestampedWord = { word: string; start: number; end: number }

async function transcribeWithTimestamps(
  apiKey: string,
  videoBytes: Blob,
  sourceUrl: string,
  contentType: string | null,
): Promise<{ transcript: string; words: TimestampedWord[] }> {
  const ext = inferExt(sourceUrl, contentType)
  const audioBlob = new Blob([await videoBytes.arrayBuffer()], { type: mimeFor(ext) })

  const form = new FormData()
  form.append('model', 'openai/whisper-1')
  form.append('file', audioBlob, `film.${ext}`)
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')

  const res = await fetch(`${GATEWAY}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const isUnsupported = res.status === 400 && /corrupted|unsupported|invalid/i.test(text)
    throw Object.assign(
      new Error(isUnsupported
        ? 'No supported speech audio track was found in this film.'
        : `Transcription failed: ${res.status} ${text}`),
      { status: res.status },
    )
  }

  const data = await res.json().catch(() => null) as {
    text?: string
    words?: Array<{ word?: string; start?: number; end?: number }>
  } | null

  const transcript = (data?.text ?? '').trim()
  const words: TimestampedWord[] = (data?.words ?? [])
    .filter((w) => typeof w.word === 'string' && typeof w.start === 'number' && typeof w.end === 'number')
    .map((w) => ({ word: w.word!.trim(), start: w.start!, end: w.end! }))

  return { transcript, words }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const ctx = await authenticate(req)
  if (!ctx) return jsonResponse({ error: 'Unauthorized' }, 401)

  try {
    const apiKey = getEnv('LOVABLE_API_KEY')

    // Parse body with a generous size limit.
    const raw = await req.text().catch(() => '')
    if (!raw.trim()) return jsonResponse({ error: 'JSON body required' }, 400)
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Request body too large' }, 413)
    }
    const parsed = BodySchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      return jsonResponse({ error: parsed.error.flatten().formErrors.join(', ') || 'Invalid request' }, 400)
    }

    const { videoUrl, storagePath, audioBase64, mimeType } = parsed.data
    let videoBytes: Blob
    let sourceUrl: string
    let contentType: string | null

    if (audioBase64) {
      const clean = audioBase64.includes(',') ? audioBase64.split(',').pop()! : audioBase64
      const bin = atob(clean)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      contentType = mimeType ?? 'audio/wav'
      videoBytes = new Blob([bytes], { type: contentType })
      sourceUrl = `audio.${contentType.includes('mp3') || contentType.includes('mpeg') ? 'mp3' : contentType.includes('webm') ? 'webm' : contentType.includes('mp4') || contentType.includes('m4a') ? 'm4a' : 'wav'}`
      if (videoBytes.size < 1024) return jsonResponse({ error: 'Audio is too small to transcribe.' }, 400)
    } else {
      sourceUrl = videoUrl ?? storagePath!
      const videoRes = await fetch(sourceUrl)
      if (!videoRes.ok) return jsonResponse({ error: `Could not load video (${videoRes.status})` }, 502)
      videoBytes = await videoRes.blob()
      contentType = videoRes.headers.get('content-type')
      if (videoBytes.size < 1024) return jsonResponse({ error: 'Video file is empty or too small.' }, 400)
    }

    const { transcript, words } = await transcribeWithTimestamps(apiKey, videoBytes, sourceUrl, contentType)

    if (!transcript) {
      return jsonResponse({ transcript: '', words: [], error: 'No speech detected in this film.' })
    }

    return jsonResponse({ transcript, words })
  } catch (e) {
    const status = (e as { status?: number }).status
    const message = e instanceof Error ? e.message : 'Unexpected error'
    if (status === 402) return jsonResponse({ error: 'AI credits exhausted.' }, 402)
    if (status === 429) return jsonResponse({ error: 'Too many requests. Try again shortly.' }, 429)
    if (status === 400) return jsonResponse({ error: message }, message.startsWith('No supported') ? 200 : 400)
    return jsonResponse({ error: message }, 500)
  }
})
