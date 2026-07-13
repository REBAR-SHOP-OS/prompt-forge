// Edge function: returns notable occasions for a Gregorian date OR a whole month.
// Supports two modes:
//   { date: 'YYYY-MM-DD', lang } -> day mode (full detail)
//   { month: 'YYYY-MM', lang }   -> month mode (list items with date+title+category, brief detail)
import { authenticate } from '../_shared/core/auth.ts'
import { readJsonLoose } from '../_shared/core/safe-json.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

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
    const lang = 'en' as const
    const date = typeof body?.date === 'string' ? body.date : ''
    const month = typeof body?.month === 'string' ? body.month : ''
    const isMonthMode = !date && /^\d{4}-\d{2}$/.test(month)
    const isDayMode = /^\d{4}-\d{2}-\d{2}$/.test(date)

    if (!isDayMode && !isMonthMode) {
      return new Response(JSON.stringify({ error: 'Provide date (YYYY-MM-DD) or month (YYYY-MM).' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const baseRules = `You are a strict calendar assistant. Return ONLY occasions that fall into one of these three allowed categories:

1) CANADIAN HOLIDAYS (category: "canada") — Canadian federal statutory holidays and widely-recognized provincial holidays (Canada Day, Victoria Day, Canadian Thanksgiving, Remembrance Day, Labour Day, Family Day, Civic Holiday, National Day for Truth and Reconciliation, Saint-Jean-Baptiste Day, etc.).

2) MAJOR INTERNATIONAL DAYS (category: "international") — Officially proclaimed UN / UNESCO / WHO international days, plus globally recognized observances (New Year's Day, International Women's Day, Earth Day, World Health Day, World Environment Day, Human Rights Day, International Day of Peace, Mother's Day, Father's Day, Valentine's Day, Halloween).

3) MAJOR RELIGIOUS HOLIDAYS (category: "religious") — Important holy days of the world's major religions: Christianity (Christmas, Easter, Good Friday, Ash Wednesday, Pentecost, Epiphany, All Saints' Day…), Islam (Eid al-Fitr, Eid al-Adha, start of Ramadan, Ashura, Mawlid…), Judaism (Rosh Hashanah, Yom Kippur, Hanukkah, Passover, Sukkot, Purim…), Hinduism (Diwali, Holi, Navaratri…), Buddhism (Vesak/Buddha Day…), Sikhism (Vaisakhi, Guru Nanak Gurpurab…). For movable dates, use the actual Gregorian date for the given year.

STRICTLY EXCLUDE:
- "National ___ Day" novelty/food/fun days.
- National holidays of countries other than Canada (unless internationally observed).
- Local, commercial, brand-driven, or minor awareness days.
- Birthdays/deaths of individuals (unless the day is officially named after them and fits 1–3).

If nothing fits, return an empty occasions array — do NOT invent.`

    const langInstruction = `Write all text fields (title, whatItIs, history) in clear English.`

    let userPrompt: string
    let detailInstruction: string

    if (isDayMode) {
      const [y, m, d] = date.split('-').map(Number)
      const dt = new Date(Date.UTC(y, m - 1, d))
      const longDate = dt.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
      })
      detailInstruction = `For EACH occasion provide:
- "category": one of "canada" | "international" | "religious".
- "date": "${date}" (the same date).
- "whatItIs": short paragraph (2-3 sentences).
- "history": paragraph (3-5 sentences) about origin, year founded, evolution.`
      userPrompt = `Provide notable occasions and their history for: ${longDate} (${date}).`
    } else {
      const [y, m] = month.split('-').map(Number)
      const monthName = MONTH_NAMES[m - 1]
      detailInstruction = `Return EVERY qualifying occasion in ${monthName} ${y}. For EACH provide:
- "date": "YYYY-MM-DD" (the actual Gregorian date in ${monthName} ${y}; for movable holidays, compute the correct date for ${y}).
- "category": "canada" | "international" | "religious".
- "title": official name.
- "whatItIs": ONE concise sentence (max ~25 words).
- "history": ONE concise sentence (max ~30 words) — origin/year only.

Be exhaustive but strict — include every qualifying observance in the month, but nothing outside the three categories.`
      userPrompt = `Return all qualifying occasions across ${monthName} ${y}.`
    }

    const systemPrompt = `${baseRules}\n\n${detailInstruction}\n\n${langInstruction}\n\nYou MUST respond by calling the return_occasions function.`

    const itemProperties: Record<string, unknown> = {
      title: { type: 'string', description: 'Official occasion name.' },
      category: { type: 'string', enum: ['canada', 'international', 'religious'], description: 'Which of the three allowed categories.' },
      whatItIs: { type: 'string' },
      history: { type: 'string' },
    }
    const requiredFields = ['title', 'category', 'whatItIs', 'history']
    if (isMonthMode) {
      itemProperties.date = { type: 'string', description: 'Gregorian date YYYY-MM-DD within the requested month.' }
      requiredFields.push('date')
    }

    const tools = [
      {
        type: 'function',
        function: {
          name: 'return_occasions',
          description: 'Return occasions list.',
          parameters: {
            type: 'object',
            properties: {
              occasions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: itemProperties,
                  required: requiredFields,
                  additionalProperties: false,
                },
              },
            },
            required: ['occasions'],
            additionalProperties: false,
          },
        },
      },
    ]

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools,
        tool_choice: { type: 'function', function: { name: 'return_occasions' } },
      }),
    })

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again shortly.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Add credits in Workspace settings.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const txt = await aiResp.text()
      console.error('AI gateway error:', aiResp.status, txt)
      return new Response(JSON.stringify({ error: 'AI gateway error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await readJsonLoose(aiResp, "day-info")
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0]
    let occasions: Array<Record<string, unknown>> = []
    try {
      const args = toolCall?.function?.arguments
      const parsed = typeof args === 'string' ? JSON.parse(args) : args
      occasions = Array.isArray(parsed?.occasions) ? parsed.occasions : []
    } catch (err) {
      console.error('Failed to parse tool call:', err)
    }

    // Normalize: ensure category fallback
    occasions = occasions.map((o) => ({
      ...o,
      category: ['canada', 'international', 'religious'].includes(String(o.category))
        ? o.category
        : 'international',
    }))

    return new Response(JSON.stringify({ occasions, lang }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('day-info error:', e)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
