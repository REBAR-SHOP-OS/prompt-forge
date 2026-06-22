// Gemini TTS edge function
// Calls Google AI Studio (Gemini 2.5 Flash Preview TTS) and returns base64 WAV.

import { authenticate } from '../_shared/core/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type Gender = 'female' | 'male' | 'child'
type Tone =
  | 'advertising'
  | 'excited'
  | 'calm'
  | 'narrative'
  | 'friendly'
  | 'serious'
  | 'dramatic'
  | 'whisper'
  | 'news'
  | 'storytelling'
  | 'cheerful'
  | 'sad'
  | 'angry'

// Prebuilt Gemini voices. See: https://ai.google.dev/gemini-api/docs/speech-generation
const VOICE_MAP: Record<Gender, Record<Tone, string>> = {
  female: {
    advertising: 'Leda',
    excited: 'Kore',
    calm: 'Aoede',
    narrative: 'Callirrhoe',
    friendly: 'Autonoe',
    serious: 'Despina',
    dramatic: 'Callirrhoe',
    whisper: 'Aoede',
    news: 'Despina',
    storytelling: 'Callirrhoe',
    cheerful: 'Kore',
    sad: 'Aoede',
    angry: 'Despina',
  },
  male: {
    advertising: 'Puck',
    excited: 'Fenrir',
    calm: 'Charon',
    narrative: 'Algieba',
    friendly: 'Achird',
    serious: 'Orus',
    dramatic: 'Algieba',
    whisper: 'Charon',
    news: 'Orus',
    storytelling: 'Algieba',
    cheerful: 'Fenrir',
    sad: 'Charon',
    angry: 'Fenrir',
  },
  // Gemini has no dedicated "kid" voice; use bright, youthful-sounding prebuilt
  // voices combined with a child-style instruction (see STYLE_INSTRUCTION/child prompt).
  child: {
    advertising: 'Leda',
    excited: 'Kore',
    calm: 'Autonoe',
    narrative: 'Leda',
    friendly: 'Autonoe',
    serious: 'Leda',
    dramatic: 'Kore',
    whisper: 'Autonoe',
    news: 'Leda',
    storytelling: 'Kore',
    cheerful: 'Kore',
    sad: 'Autonoe',
    angry: 'Kore',
  },
}

const STYLE_INSTRUCTION: Record<Tone, string> = {
  advertising:
    'Say the following in an upbeat, persuasive advertising voice with energy and excitement',
  excited: 'Say the following enthusiastically and with high energy',
  calm: 'Say the following in a calm, soothing and relaxed tone',
  narrative: 'Say the following as a clear, engaging narrator',
  friendly: 'Say the following in a warm, friendly, conversational tone',
  serious: 'Say the following in a serious, authoritative tone',
  dramatic: 'Say the following in a dramatic, intense and expressive tone with emotional weight',
  whisper: 'Say the following in a soft, gentle, hushed whisper',
  news: 'Say the following in a clear, professional news-anchor broadcast tone',
  storytelling: 'Say the following like a captivating storyteller, warm and expressive',
  cheerful: 'Say the following in a cheerful, bright and happy tone',
  sad: 'Say the following in a sad, melancholic and emotional tone',
  angry: 'Say the following in an angry, intense and forceful tone',
}

const GENDERS: Gender[] = ['female', 'male', 'child']
const TONES: Tone[] = [
  'advertising', 'excited', 'calm', 'narrative', 'friendly', 'serious',
  'dramatic', 'whisper', 'news', 'storytelling', 'cheerful', 'sad', 'angry',
]

function isGender(v: unknown): v is Gender {
  return typeof v === 'string' && (GENDERS as string[]).includes(v)
}
function isTone(v: unknown): v is Tone {
  return typeof v === 'string' && (TONES as string[]).includes(v)
}

// Allowed explicit Gemini prebuilt voices (catalog from the Voiceover dialog).
const ALLOWED_VOICES = new Set<string>([
  'Leda', 'Kore', 'Aoede', 'Callirrhoe', 'Autonoe', 'Despina',
  'Puck', 'Charon', 'Fenrir', 'Algieba', 'Orus', 'Achird',
])
function isAllowedVoice(v: unknown): v is string {
  return typeof v === 'string' && ALLOWED_VOICES.has(v)
}

// Build a WAV file (PCM 16-bit) from raw PCM bytes.
function pcmToWav(pcm: Uint8Array, sampleRate = 24000, channels = 1): Uint8Array {
  const bitsPerSample = 16
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const dataSize = pcm.byteLength
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  new Uint8Array(buffer, 44).set(pcm)
  return new Uint8Array(buffer)
}

// Pitch-preserving time-stretch of 16-bit mono PCM using overlap-add (OLA).
// factor > 1 makes audio longer (slower); factor < 1 makes it shorter (faster).
function timeStretchPcm16(pcm: Uint8Array, factor: number, sampleRate: number): Uint8Array {
  if (!isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 0.001) return pcm
  const input = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
  const inLen = input.length
  if (inLen === 0) return pcm

  // Frame ~30ms, 50% overlap synthesis hop, analysis hop scaled by factor.
  const frame = Math.max(256, Math.round(sampleRate * 0.03))
  const synHop = Math.floor(frame / 2)
  const anaHop = Math.max(1, Math.round(synHop / factor))
  const outLen = Math.max(frame, Math.round(inLen / factor) + frame)
  const out = new Float32Array(outLen)
  const norm = new Float32Array(outLen)
  const win = new Float32Array(frame)
  for (let i = 0; i < frame; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1))

  let outPos = 0
  for (let inPos = 0; inPos + frame <= inLen; inPos += anaHop) {
    for (let i = 0; i < frame; i++) {
      const w = win[i]
      out[outPos + i] += input[inPos + i] * w
      norm[outPos + i] += w
    }
    outPos += synHop
    if (outPos + frame > outLen) break
  }

  const used = Math.min(outLen, outPos + frame)
  const result = new Int16Array(used)
  for (let i = 0; i < used; i++) {
    const n = norm[i] > 1e-6 ? norm[i] : 1
    let v = out[i] / n
    if (v > 32767) v = 32767
    else if (v < -32768) v = -32768
    result[i] = v
  }
  return new Uint8Array(result.buffer.slice(0, result.byteLength))
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

// Try to parse a sample rate hint from a mimeType like
// "audio/L16;codec=pcm;rate=24000".
function parseRateFromMime(mime: string | undefined): number {
  if (!mime) return 24000
  const m = /rate=(\d+)/i.exec(mime)
  return m ? parseInt(m[1], 10) || 24000 : 24000
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const auth = await authenticate(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const body = await req.json().catch(() => null) as
      | { text?: string; gender?: string; tone?: string; durationSec?: number }
      | null
    if (!body) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const text = (body.text || '').trim()
    const gender: Gender = isGender(body.gender) ? body.gender : 'female'
    const tone: Tone = isTone(body.tone) ? body.tone : 'narrative'

    // Optional target duration in seconds (1–600). Omitted => no constraint.
    let targetDurationSec: number | null = null
    if (typeof body.durationSec === 'number' && isFinite(body.durationSec)) {
      const d = Math.round(body.durationSec)
      if (d >= 1 && d <= 600) targetDurationSec = d
    }

    if (!text) {
      return new Response(JSON.stringify({ error: 'text is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (text.length > 5000) {
      return new Response(JSON.stringify({ error: 'text too long (max 5000 chars)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const voiceName = VOICE_MAP[gender][tone]
    const paceHint = targetDurationSec
      ? ` Pace the delivery naturally so the entire line lasts about ${targetDurationSec} seconds.`
      : ''
    const childHint = gender === 'child'
      ? ' Use the bright, light, youthful voice of a young child'
      : ''
    const styledPrompt = `${STYLE_INSTRUCTION[tone]}${childHint}${paceHint}: ${text}`

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(apiKey)}`

    const geminiResp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: styledPrompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      }),
    })

    if (!geminiResp.ok) {
      const errText = await geminiResp.text()
      console.error('Gemini TTS error', geminiResp.status, errText)
      const status = geminiResp.status === 429 ? 429 : 502
      return new Response(
        JSON.stringify({ error: `TTS provider error (${status})` }),
        {
          status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const json = await geminiResp.json()
    const part = json?.candidates?.[0]?.content?.parts?.find(
      (p: { inlineData?: { data?: string; mimeType?: string } }) => p?.inlineData?.data,
    )
    const inline = part?.inlineData
    if (!inline?.data) {
      console.error('No audio in response', JSON.stringify(json).slice(0, 500))
      return new Response(JSON.stringify({ error: 'No audio returned by provider' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let pcm = base64ToBytes(inline.data)
    const sampleRate = parseRateFromMime(inline.mimeType)

    // Snap to the requested duration via pitch-preserving time-stretch.
    const bytesPerSample = 2
    const rawDurationSec = pcm.byteLength / (sampleRate * bytesPerSample)
    let actualDurationSec = rawDurationSec
    let warning: string | undefined

    if (targetDurationSec && rawDurationSec > 0) {
      if (Math.abs(rawDurationSec - targetDurationSec) > 0.15) {
        // factor = target / source (>1 => stretch longer). Clamp to keep quality.
        let factor = targetDurationSec / rawDurationSec
        const clamped = Math.min(1.8, Math.max(0.6, factor))
        if (clamped !== factor) {
          warning =
            `The text is ${rawDurationSec > targetDurationSec ? 'too long' : 'too short'} ` +
            `for a ${targetDurationSec}s voiceover, so the duration was adjusted as close as possible. ` +
            `Try ${rawDurationSec > targetDurationSec ? 'shortening' : 'lengthening'} the text for an exact fit.`
          factor = clamped
        }
        pcm = timeStretchPcm16(pcm, factor, sampleRate)
        actualDurationSec = pcm.byteLength / (sampleRate * bytesPerSample)
      } else {
        actualDurationSec = rawDurationSec
      }
    }

    const wav = pcmToWav(pcm, sampleRate, 1)
    const wavBase64 = bytesToBase64(wav)

    return new Response(
      JSON.stringify({
        audioBase64: wavBase64,
        mimeType: 'audio/wav',
        sampleRate,
        voiceName,
        gender,
        tone,
        targetDurationSec,
        actualDurationSec: Math.round(actualDurationSec * 100) / 100,
        warning,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (e) {
    console.error('tts-generate error:', e)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

