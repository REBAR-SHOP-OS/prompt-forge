// Edge function: returns rich Markdown info about a Gregorian date using Lovable AI.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const date = String(body?.date ?? '')
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

    const systemPrompt = `You are a marketing strategist. For a given Gregorian date, return ONLY observances and holidays useful for advertising/marketing campaigns (e.g. International Days like World Chocolate Day, Mother's Day, Father's Day, Black Friday, Cyber Monday, Valentine's Day, Earth Day, Pride, Halloween, Christmas shopping, widely-celebrated cultural days, awareness months, major sport finals).

SKIP: purely historical events, birthdays, deaths, obscure local holidays, and religious-only observances with no commercial/marketing angle.

If the date has NO marketing-worthy occasion, say so honestly in both languages — do not invent.

Output bilingual GitHub-flavored Markdown. For every heading and bullet, write the English line first, then immediately below it the Persian translation in italics on its own line. Persian must be natural and idiomatic, not literal.

Use exactly this structure:

## 🎯 Marketing-Worthy Occasions
*مناسبت‌های مناسب تبلیغات*

For each occasion:

### {Occasion Name}
*{ترجمه فارسی نام مناسبت}*

**What it is:** short English description.
*توضیح فارسی کوتاه.*

**Audience:** target audience in English.
*مخاطب هدف به فارسی.*

**Campaign Ideas:**
- English idea 1
  - *ایده فارسی ۱*
- English idea 2
  - *ایده فارسی ۲*
- English idea 3
  - *ایده فارسی ۳*

**Hashtags:** \`#Tag1\` \`#Tag2\` \`#Tag3\`

Provide 3–5 concrete, creative campaign ideas per occasion (promotions, social posts, content angles, partnerships, UGC, giveaways).`

    const userPrompt = `Provide marketing-worthy occasions for: ${longDate} (${date}).`

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
    const markdown: string = data?.choices?.[0]?.message?.content ?? ''
    return new Response(JSON.stringify({ markdown }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('day-info error:', e)
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
