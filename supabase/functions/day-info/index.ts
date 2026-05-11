// Edge function: returns structured marketing-worthy occasions for a Gregorian date.
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

    const baseRules = `You are a marketing strategist. For a given Gregorian date, return ONLY observances and holidays useful for advertising/marketing campaigns (e.g. International Days like World Chocolate Day, Mother's Day, Father's Day, Black Friday, Cyber Monday, Valentine's Day, Earth Day, Pride, Halloween, Christmas shopping, widely-celebrated cultural days, awareness months, major sport finals).

SKIP: purely historical events, birthdays, deaths, obscure local holidays, and religious-only observances with no commercial/marketing angle.

If the date has NO marketing-worthy occasion, return an empty occasions array — do not invent.

Provide 3–5 concrete, creative campaign ideas per occasion (promotions, social posts, content angles, partnerships, UGC, giveaways).`

    const langInstruction = lang === 'fa'
      ? `همه فیلدها (title, whatItIs, audience, ideas, hashtags) را به زبان فارسی روان و طبیعی (نه تحت‌اللفظی) بنویس. در title نام بین‌المللی را در پرانتز انگلیسی بیاور (مثل: روز جهانی شکلات (World Chocolate Day)). هشتگ‌ها بدون کاراکتر # و می‌توانند فارسی یا انگلیسی باشند.`
      : `Write all fields (title, whatItIs, audience, ideas, hashtags) in English. Hashtags without the # character.`

    const systemPrompt = `${baseRules}\n\n${langInstruction}\n\nYou MUST respond by calling the return_occasions function.`
    const userPrompt = lang === 'fa'
      ? `مناسبت‌های تبلیغاتی این تاریخ را بده: ${longDate} (${date}).`
      : `Provide marketing-worthy occasions for: ${longDate} (${date}).`

    const tools = [
      {
        type: 'function',
        function: {
          name: 'return_occasions',
          description: 'Return a list of marketing-worthy occasions for the date.',
          parameters: {
            type: 'object',
            properties: {
              occasions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'Occasion name' },
                    whatItIs: { type: 'string', description: 'Short description of what the occasion is' },
                    audience: { type: 'string', description: 'Target audience for marketing' },
                    ideas: {
                      type: 'array',
                      items: { type: 'string' },
                      description: '3-5 concrete campaign ideas',
                    },
                    hashtags: {
                      type: 'array',
                      items: { type: 'string' },
                      description: '3-5 hashtags without # character',
                    },
                  },
                  required: ['title', 'whatItIs', 'audience', 'ideas', 'hashtags'],
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
