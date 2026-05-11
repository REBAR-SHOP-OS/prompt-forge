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

    const systemPrompt = `You are a knowledgeable historian and cultural guide. For a given Gregorian date, return rich, well-structured GitHub-flavored Markdown. Always include these sections (omit a section only if truly nothing notable):

## 📅 Overview
One short paragraph summarizing the date.

## 🌍 International Observances & Holidays
Bullet list (UN days, widely-celebrated holidays).

## 📜 Notable Historical Events
Bullet list of 4–8 important events on this month/day across history. Prefix each with the year.

## 🎂 Famous Birthdays
3–6 notable people born on this month/day. Format: **Name** (year) — short note.

## 🕯️ Notable Deaths
2–4 notable people who died on this month/day. Same format.

## ✨ Fun Facts
1–2 interesting tidbits.

Be accurate and concise. Use English.`

    const userPrompt = `Provide complete information for: ${longDate} (${date}).`

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
