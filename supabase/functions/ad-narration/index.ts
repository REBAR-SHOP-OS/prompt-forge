// ad-narration edge function: writes a short, natural ENGLISH advertising
// voiceover script for a given product, paced to a target duration (seconds).
// Returns spoken words only (no scene/visual directions, no labels).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { authenticate } from '../_shared/core/auth.ts'

interface Body {
  productName?: string
  durationSec?: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const auth = await authenticate(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = (await req.json().catch(() => null)) as Body | null
    if (!body) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rawProductName = (body.productName || '').trim()
    if (!rawProductName) {
      return new Response(JSON.stringify({ error: 'productName is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use ONLY the descriptive product name — strip any numeric codes / SKUs,
    // separators (_ - /) and extra whitespace. e.g. "rebar_stirrup_008" ->
    // "rebar stirrup". Fall back to the raw name if cleaning empties it.
    const cleanedProductName =
      rawProductName
        .replace(/[_\-/]+/g, ' ')
        .replace(/\d+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || rawProductName
    const productName = cleanedProductName

    let durationSec = Number(body.durationSec)
    if (!Number.isFinite(durationSec)) durationSec = 15
    durationSec = Math.min(600, Math.max(1, Math.round(durationSec)))

    // ~2.3 spoken words per second is a natural advertising pace.
    const wordBudget = Math.max(6, Math.round(durationSec * 2.3))

    const systemPrompt =
      'You are a professional advertising copywriter. You write punchy, ' +
      'high-energy, persuasive voiceover scripts that a narrator can read ' +
      'aloud naturally. The tone is ALWAYS advertising / commercial. ' +
      'Output ONLY the spoken words in English — no scene directions, no stage ' +
      'notes, no camera notes, no labels, no quotation marks, no markdown, no ' +
      'lists. Just clean sentences ready to be spoken. ' +
      'CRITICAL: Never include any numbers, digits, product codes, SKUs, model ' +
      'numbers, dimensions, prices, or percentages — not as numerals and not ' +
      'spelled out as words (e.g. never "double oh eight", "zero zero eight", ' +
      'or "008"). Refer to the product only by its descriptive name.'

    const userPrompt =
      `Write an English advertising voiceover for the product "${productName}".\n` +
      `Target spoken duration: about ${durationSec} seconds ` +
      `(roughly ${wordBudget} words — stay close to this length).\n` +
      `Make it persuasive, vivid, and end with a short memorable call to action. ` +
      `Use ONLY the product name "${productName}" — do not invent or mention any ` +
      `numbers, codes, or model identifiers. Return only the narration text.`

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      console.error('ad-narration gateway error', resp.status, errText)
      const status = resp.status === 429 ? 429 : resp.status === 402 ? 402 : 502
      const message =
        status === 429
          ? 'Rate limit reached. Please try again in a moment.'
          : status === 402
            ? 'AI credits exhausted. Please add credits and try again.'
            : 'Narration provider error.'
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const json = await resp.json()
    const narration: string = (json?.choices?.[0]?.message?.content || '').trim()
    if (!narration) {
      return new Response(JSON.stringify({ error: 'No narration returned' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({ narration, productName, durationSec }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('ad-narration error:', e)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
