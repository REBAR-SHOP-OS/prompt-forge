// Edge function: returns notable observances/holidays for a Gregorian date,
// each with a short description and a history paragraph.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const date = String(body?.date ?? '')
    const lang: 'en' | 'fa' = body?.lang === 'fa' ? 'fa' : 'en'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(JSON.stringify({ error: 'Invalid date. Expected YYYY-MM-DD.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const [year, month, day] = date.split('-').map(Number)
    const dt = new Date(Date.UTC(year, month - 1, day))
    const longDate = dt.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
    })

    const baseRules = `You are a knowledgeable calendar assistant. For a given Gregorian date, return notable observances, international days, widely-celebrated holidays, and well-known awareness days for that date (e.g. International Nurses Day, World Chocolate Day, Mother's Day, Earth Day, Valentine's Day, Halloween, Christmas, Pride, etc.).

Include any occasion that has broad cultural, social, professional, or international recognition. Skip purely local/obscure events and pure birthdays/deaths unless the day itself is officially named after them.

If the date has NO notable occasion, return an empty occasions array — do not invent.

For EACH occasion provide:
- "whatItIs": one short paragraph (2-3 sentences) introducing what the occasion is and how it is observed today.
- "history": one paragraph (3-5 sentences) about its origin: when and where it started, who founded/proclaimed it, the year it began, the original purpose, and how it evolved over time. Be concrete with years and names where possible.`

    const langInstruction = lang === 'fa'
      ? `همه فیلدها (title, whatItIs, history) را به زبان فارسی روان و طبیعی (نه تحت‌اللفظی) بنویس. در title نام بین‌المللی را در پرانتز انگلیسی بیاور (مثل: روز جهانی پرستار (International Nurses Day)).`
      : `Write all fields (title, whatItIs, history) in clear English.`

    const systemPrompt = `${baseRules}\n\n${langInstruction}\n\nYou MUST respond by calling the return_occasions function.`
    const userPrompt = lang === 'fa'
      ? `مناسبت‌های این تاریخ را همراه با تاریخچه‌شان بده: ${longDate} (${date}).`
      : `Provide notable occasions and their history for: ${longDate} (${date}).`

    const tools = [
      {
        type: 'function',
        function: {
          name: 'return_occasions',
          description: 'Return a list of notable occasions for the date with description and history.',
          parameters: {
            type: 'object',
            properties: {
              occasions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'Occasion name' },
                    whatItIs: { type: 'string', description: 'Short description of what the occasion is and how it is observed today (2-3 sentences).' },
                    history: { type: 'string', description: 'Origin and history paragraph: when/where it started, who founded it, the year, original purpose, and how it evolved (3-5 sentences).' },
                  },
                  required: ['title', 'whatItIs', 'history'],
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

    const data = await aiResp.json()
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0]
    let occasions: unknown[] = []
    try {
      const args = toolCall?.function?.arguments
      const parsed = typeof args === 'string' ? JSON.parse(args) : args
      occasions = Array.isArray(parsed?.occasions) ? parsed.occasions : []
    } catch (err) {
      console.error('Failed to parse tool call:', err)
    }

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
