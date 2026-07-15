// narration-review: transcribe a final film with word-level timestamps and
// return the raw word list so the client can diff against expected narration.
// Supports a second translation-only mode: send `translate_texts` + `target_language`
// to translate an array of strings without triggering transcription.
//
// Security notes:
//   SSRF — videoUrl is restricted to https:// on this project's Supabase host
//           only (resolved from SUPABASE_URL env var at request time). Any
//           other scheme or hostname is rejected with 400.
//   Size  — server refuses downloads larger than MAX_VIDEO_BYTES (18 MB) and
//           caps streaming reads so an unbounded video can never OOM the worker.
//           Callers should pre-extract audio locally for large films and send
//           audioBase64 instead (the client NarrationReviewPanel does this).
import { authenticate } from '../_shared/core/auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/core/http.ts'
import { getEnv } from '../_shared/core/env.ts'
import { z } from 'npm:zod@3'

const GATEWAY = 'https://ai.gateway.lovable.dev/v1'

// Match the client-side MAX_TRANSCRIPT_AUDIO_BYTES in extractAudio.ts (18 MB).
const MAX_VIDEO_BYTES        = 18 * 1024 * 1024  // server-side cap for URL downloads
const MAX_AUDIO_DECODED_BYTES = 18 * 1024 * 1024  // decoded cap for audioBase64 path
// audioBase64 is ~4/3× the decoded size; 30 MB body = ~22 MB decoded, with headroom.
const MAX_BODY_BYTES         = 30 * 1024 * 1024
const MAX_TRANSLATE_TEXTS    = 50
const MAX_TRANSLATE_TEXT_LEN = 4000

// Fail-closed SSRF guard: only https:// from this project's Supabase host.
function isAllowedVideoUrl(url: string, allowedHost: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === allowedHost
  } catch {
    return false
  }
}

// Schema: storagePath removed — it would be fetched as a raw URL (SSRF vector).
// Callers send either a videoUrl (must be the project's Supabase host) or
// audioBase64 extracted client-side for large films.
const TranscriptionBodySchema = z.object({
  videoUrl:     z.string().url().optional(),
  audioBase64:  z.string().min(1).optional(),
  mimeType:     z.string().min(1).max(128).optional(),
  translate_to: z.string().min(1).max(64).optional(),
}).refine(
  (v) => Boolean(v.videoUrl || v.audioBase64),
  { message: 'videoUrl or audioBase64 is required' },
)

const TranslationBodySchema = z.object({
  translate_texts:  z.array(z.string().max(MAX_TRANSLATE_TEXT_LEN)).min(1).max(MAX_TRANSLATE_TEXTS),
  target_language:  z.string().min(1).max(64),
})

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

export async function translateTexts(
  apiKey: string,
  texts: string[],
  targetLanguage: string,
): Promise<string[]> {
  const payload = JSON.stringify(texts)
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            `You are a precise translator. Translate every string in the JSON array to ${targetLanguage}. ` +
            `Preserve meaning, tone, and any quoted words. Return ONLY a valid JSON array of translated strings ` +
            `in the same order. No markdown fences, no explanations.`,
        },
        { role: 'user', content: payload },
      ],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw Object.assign(new Error(`Translation failed: ${res.status} ${text}`), { status: res.status })
  }

  const data = await res.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string } }>
  } | null
  const raw = (data?.choices?.[0]?.message?.content ?? '').trim()

  // Strip optional markdown code fence
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  try {
    const parsed: unknown = JSON.parse(clean)
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      if (parsed.length !== texts.length) throw new Error('Length mismatch in translation response')
      return parsed as string[]
    }
    throw new Error('Translation response is not a string array')
  } catch (e) {
    throw new Error(`Translation parse error: ${e instanceof Error ? e.message : String(e)}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const ctx = await authenticate(req)
  if (!ctx) return jsonResponse({ error: 'Unauthorized' }, 401)

  try {
    const apiKey = getEnv('LOVABLE_API_KEY')
    // Resolve the allowed hostname once per request from the canonical env var
    // so this function is portable across Supabase projects and test environments.
    const supabaseHost = new URL(getEnv('SUPABASE_URL')).hostname

    const raw = await req.text().catch(() => '')
    if (!raw.trim()) return jsonResponse({ error: 'JSON body required' }, 400)
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Request body too large' }, 413)
    }

    let parsedBody: unknown
    try { parsedBody = JSON.parse(raw) } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    // ── Translation-only mode ──────────────────────────────────────────────
    const translationParsed = TranslationBodySchema.safeParse(parsedBody)
    if (translationParsed.success) {
      const { translate_texts, target_language } = translationParsed.data
      const translations = await translateTexts(apiKey, translate_texts, target_language)
      return jsonResponse({ translations })
    }

    // ── Transcription mode ─────────────────────────────────────────────────
    const parsed = TranscriptionBodySchema.safeParse(parsedBody)
    if (!parsed.success) {
      return jsonResponse({ error: parsed.error.flatten().formErrors.join(', ') || 'Invalid request' }, 400)
    }

    const { videoUrl, audioBase64, mimeType, translate_to } = parsed.data
    let videoBytes: Blob
    let sourceUrl: string
    let contentType: string | null

    if (audioBase64) {
      const clean = audioBase64.includes(',') ? audioBase64.split(',').pop()! : audioBase64
      let bytes: Uint8Array
      try {
        const bin = atob(clean)
        bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      } catch {
        return jsonResponse({ error: 'Invalid audioBase64 payload.' }, 400)
      }
      contentType = mimeType ?? 'audio/wav'
      videoBytes = new Blob([bytes], { type: contentType })
      sourceUrl = `audio.${contentType.includes('mp3') || contentType.includes('mpeg') ? 'mp3' : contentType.includes('webm') ? 'webm' : contentType.includes('mp4') || contentType.includes('m4a') ? 'm4a' : 'wav'}`
      if (videoBytes.size < 1024) return jsonResponse({ error: 'Audio is too small to transcribe.' }, 400)
      if (videoBytes.size > MAX_AUDIO_DECODED_BYTES) {
        return jsonResponse({ error: 'Audio is too large to transcribe. Extract a shorter segment.' }, 413)
      }
    } else {
      // SSRF guard: reject any URL that is not https:// on this project's Supabase host.
      if (!isAllowedVideoUrl(videoUrl!, supabaseHost)) {
        return jsonResponse({ error: 'Invalid video URL.' }, 400)
      }

      sourceUrl = videoUrl!
      const videoRes = await fetch(sourceUrl)
      if (!videoRes.ok) return jsonResponse({ error: `Could not load video (${videoRes.status})` }, 502)

      // Fast path: reject before downloading when Content-Length is declared and too large.
      const declaredLen = parseInt(videoRes.headers.get('content-length') ?? '0', 10)
      if (Number.isFinite(declaredLen) && declaredLen > MAX_VIDEO_BYTES) {
        return jsonResponse(
          { error: 'Video is too large to transcribe server-side. Extract audio locally and send audioBase64.', code: 'MEDIA_TOO_LARGE' },
          413,
        )
      }

      // Bounded stream read: never buffer more than MAX_VIDEO_BYTES regardless of
      // whether the server sent a Content-Length header.
      const reader = videoRes.body?.getReader()
      if (!reader) return jsonResponse({ error: 'Video stream is not readable.' }, 502)
      const chunks: Uint8Array[] = []
      let totalBytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        totalBytes += value.byteLength
        if (totalBytes > MAX_VIDEO_BYTES) {
          reader.cancel().catch(() => { /* ignore abort errors */ })
          return jsonResponse(
            { error: 'Video is too large to transcribe server-side. Extract audio locally and send audioBase64.', code: 'MEDIA_TOO_LARGE' },
            413,
          )
        }
        chunks.push(value)
      }
      const merged = new Uint8Array(totalBytes)
      let offset = 0
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }

      contentType = videoRes.headers.get('content-type')
      videoBytes = new Blob([merged], { type: contentType ?? 'video/mp4' })
      if (videoBytes.size < 1024) return jsonResponse({ error: 'Video file is empty or too small.' }, 400)
    }

    const { transcript, words } = await transcribeWithTimestamps(apiKey, videoBytes, sourceUrl, contentType)

    if (!transcript) {
      return jsonResponse({ transcript: '', words: [], error: 'No speech detected in this film.' })
    }

    // Optional: translate the transcript for display. Alignment always uses
    // the original transcript + words, never the translated version.
    let transcript_translated: string | undefined
    if (translate_to) {
      try {
        const [t] = await translateTexts(apiKey, [transcript], translate_to)
        transcript_translated = t
      } catch {
        // Non-fatal: return result without translation if it fails.
      }
    }

    return jsonResponse({
      transcript,
      words,
      ...(transcript_translated ? { transcript_translated, translate_to } : {}),
    })
  } catch (e) {
    const status = (e as { status?: number }).status
    const message = e instanceof Error ? e.message : 'Unexpected error'
    if (status === 402) return jsonResponse({ error: 'AI credits exhausted.' }, 402)
    if (status === 429) return jsonResponse({ error: 'Too many requests. Try again shortly.' }, 429)
    if (status === 400) return jsonResponse({ error: message }, message.startsWith('No supported') ? 200 : 400)
    return jsonResponse({ error: message }, 500)
  }
})
