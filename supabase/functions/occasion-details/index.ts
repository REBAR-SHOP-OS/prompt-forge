// deno-lint-ignore-file no-explicit-any

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { isoDate, knownOccasions } = await req.json()
    if (!isoDate || typeof isoDate !== 'string') {
      return new Response(JSON.stringify({ error: 'isoDate is required' }), {
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

    const occasionsText = Array.isArray(knownOccasions) && knownOccasions.length > 0
      ? `Known international occasions on this date: ${knownOccasions.join(', ')}.`
      : 'There are no widely-known international occasions on this date in our static dataset — surface any notable historical events, birthdays of famous figures, or cultural moments instead.'

    const prompt = `For ${isoDate}, provide a rich but concise overview suitable for a content creator.
${occasionsText}

Structure the response as Markdown with these sections:
## Overview
A 2-3 sentence summary of the day's significance.

## Historical Background
Key origins, dates of establishment, founding bodies/people.

## How It's Observed
Common worldwide activities, traditions, or events.

## Notable Facts
3-5 short bullet points with interesting facts.

## Content Angles for Video Creators
3-4 short bullet ideas for short-form videos / reels relating to this day.

Keep total length under 450 words. Use clear headings and bullet lists.`

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a knowledgeable cultural historian. Always respond in clean Markdown.' },
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again shortly.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits in workspace settings.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const t = await response.text()
      console.error('AI gateway error:', response.status, t)
      return new Response(JSON.stringify({ error: 'AI gateway error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data: any = await response.json()
    const markdown = data?.choices?.[0]?.message?.content ?? ''

    return new Response(JSON.stringify({ markdown }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('occasion-details error:', e)
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
