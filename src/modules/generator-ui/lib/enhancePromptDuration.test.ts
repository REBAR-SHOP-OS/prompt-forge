import { describe, expect, it } from 'vitest'
import edgeSource from '../../../../supabase/functions/enhance-prompt/index.ts?raw'

const guidanceStart = edgeSource.indexOf('const DURATION_PACING_GUIDANCE')
const guidanceEnd = edgeSource.indexOf('Deno.serve', guidanceStart)

if (guidanceStart < 0 || guidanceEnd < 0) {
  throw new Error('Duration pacing guidance block not found')
}

const guidanceSource = edgeSource.slice(guidanceStart, guidanceEnd)

function guidanceFor(duration: number): string {
  const match = guidanceSource.match(new RegExp(`\\n  ${duration}: "([^"]+)",`))
  if (!match) throw new Error(`Missing duration guidance for ${duration} seconds`)
  return match[1]
}

describe('enhance-prompt duration pacing guidance', () => {
  it.each([
    [5, 'one immediate visual beat'],
    [10, 'one fluid mini-arc'],
    [15, 'one complete short arc'],
    [30, 'exactly 2 sequential 15-second sections'],
    [45, 'exactly 3 sequential 15-second sections'],
    [135, 'exactly 9 sequential 15-second sections'],
  ] as const)('defines specific pacing for %i seconds', (duration, expectedPacing) => {
    expect(guidanceFor(duration)).toContain(expectedPacing)
  })

  it('turns section timing into one coherent prompt without scene delimiters', () => {
    expect(guidanceSource).toContain('Use the timing only as internal pacing guidance.')
    expect(guidanceSource).toContain('Return one coherent cinematic prompt with smooth continuity, not separate prompts.')
    expect(guidanceSource).toContain('Do NOT output timestamps, shot lists, section headings, or scene delimiters such as ===SCENE===.')
    expect(edgeSource).toContain('filmContextParts.push(`DURATION: ${duration} seconds total. ${durationGuidanceFor(duration)}`)')
  })
})
