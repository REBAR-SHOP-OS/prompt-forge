// Edge function: returns notable occasions for a Gregorian date OR a whole month.
// Presence + dates are DETERMINISTIC (see _shared/occasions.ts) — AI is used only
// to write the descriptive prose for occasions that we already know exist.
//   { date: 'YYYY-MM-DD', lang } -> day mode (full detail: whatItIs + history)
//   { month: 'YYYY-MM', lang }   -> month mode (brief one-liner each)
import { authenticate } from '../_shared/core/auth.ts'
import { occasionsForDate, occasionsForMonth, type DatasetOccasion } from '../_shared/occasions.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const CATEGORY_LABELS: Record<string, { en: string; fa: string }> = {
  canada: { en: 'Canadian holiday', fa: 'مناسبت کانادا' },
  international: { en: 'International day', fa: 'روز بین‌المللی' },
  religious: { en: 'Religious holiday', fa: 'مناسبت دینی' },
}

function fallbackBlurb(o: DatasetOccasion, lang: 'en' | 'fa') {
  const label = CATEGORY_LABELS[o.category]?.[lang] ?? ''
  if (lang === 'fa') {
    return {
      whatItIs: `${o.title} یک ${label} است که در این تاریخ گرامی داشته می‌شود.`,
      history: `${o.title} به‌طور سنتی در این روز هر سال جشن گرفته می‌شود.`,
    }
  }
  return {
    whatItIs: `${o.title} is a ${label} observed on this date.`,
    history: `${o.title} is traditionally marked on this day each year.`,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const auth = await authenticate(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const lang: 'en' | 'fa' = body?.lang === 'fa' ? 'fa' : 'en'
    const date = typeof body?.date === 'string' ? body.date : ''
    const month = typeof body?.month === 'string' ? body.month : ''
    const isMonthMode = !date && /^\d{4}-\d{2}$/.test(month)
    const isDayMode = /^\d{4}-\d{2}-\d{2}$/.test(date)

    if (!isDayMode && !isMonthMode) {
      return new Response(JSON.stringify({ error: 'Provide date (YYYY-MM-DD) or month (YYYY-MM).' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Deterministic occasion list — this is the single source of truth.
    const matches: DatasetOccasion[] = isDayMode
      ? occasionsForDate(date)
      : occasionsForMonth(month)

    // No occasions -> return empty immediately (keeps the red dot off).
    if (matches.length === 0) {
      return new Response(JSON.stringify({ occasions: [], lang }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Try to enrich descriptions with AI. If anything fails, fall back to blurbs
    // so the deterministic dates always render.
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    let descriptions: Record<string, { whatItIs: string; history: string }> = {}

    if (LOVABLE_API_KEY) {
      try {
        const titles = matches.map((m) => m.title)
        const detailRule = isMonthMode
          ? 'For each, write a "whatItIs" of ONE concise sentence and a "history" of ONE concise sentence.'
          : 'For each, write a "whatItIs" paragraph (2-3 sentences) and a "history" paragraph (3-5 sentences about origin and evolution).'
        const langRule = lang === 'fa'
          ? 'Write whatItIs and history in fluent Persian (Farsi).'
          : 'Write whatItIs and history in clear English.'
        const systemPrompt = `You are a factual calendar assistant. You are given a FIXED list of occasion titles. Do NOT add, remove, rename, or change dates of any occasion. Only write descriptions. ${detailRule} ${langRule} You MUST respond by calling return_descriptions with one entry per provided title, echoing the title exactly.`
        const userPrompt = `Occasion titles:\n${titles.map((t) => `- ${t}`).join('\n')}`

        const tools = [{
          type: 'function',
          function: {
            name: 'return_descriptions',
            description: 'Return descriptions for each occasion title.',
            parameters: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      whatItIs: { type: 'string' },
                      history: { type: 'string' },
                    },
                    required: ['title', 'whatItIs', 'history'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['items'],
              additionalProperties: false,
            },
          },
        }]

        const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            tools,
            tool_choice: { type: 'function', function: { name: 'return_descriptions' } },
          }),
        })

        if (aiResp.ok) {
          const data = await aiResp.json()
          const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0]
          const args = toolCall?.function?.arguments
          const parsed = typeof args === 'string' ? JSON.parse(args) : args
          const items: Array<{ title?: string; whatItIs?: string; history?: string }> =
            Array.isArray(parsed?.items) ? parsed.items : []
          for (const it of items) {
            if (it?.title) {
              descriptions[String(it.title)] = {
                whatItIs: String(it.whatItIs ?? ''),
                history: String(it.history ?? ''),
              }
            }
          }
        } else {
          console.error('AI gateway error:', aiResp.status, await aiResp.text())
        }
      } catch (err) {
        console.error('AI enrichment failed, using fallbacks:', err)
      }
    }

    const occasions = matches.map((m) => {
      const ai = descriptions[m.title]
      const fb = fallbackBlurb(m, lang)
      const result: Record<string, unknown> = {
        title: m.title,
        category: m.category,
        whatItIs: ai?.whatItIs?.trim() || fb.whatItIs,
        history: ai?.history?.trim() || fb.history,
      }
      if (isMonthMode) result.date = m.date
      return result
    })

    return new Response(JSON.stringify({ occasions, lang }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('day-info error:', e)
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
