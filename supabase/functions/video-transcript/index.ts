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

async function transcribeVideo(apiKey: string, videoBytes: Blob): Promise<string> {
  const form = new FormData()
  form.append('model', 'openai/gpt-4o-mini-transcribe')
  form.append('file', videoBytes, 'film.mp4')
  // non-streaming: default JSON response with the transcript text

  const res = await fetch(`${GATEWAY}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(`Transcription failed: ${res.status} ${text}`)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }

  const data = await res.json().catch(() => null) as { text?: string } | null
  return (data?.text ?? '').trim()
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

    const transcript = await transcribeVideo(apiKey, videoBytes)
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
    return json({ error: message }, 500)
  }
})
