import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'supabase/functions/ai-image-generate/index.ts'),
  'utf8',
)

describe('ai-image-generate physical-interaction guidance scope', () => {
  it('adds the guidance only when identity references are evaluated', () => {
    expect(source).toContain('const interactionGuidance = evaluatedSpecs.length > 0')
    expect(source).toContain('Subject: ${prompt}${interactionGuidance}')
  })

  it('never injects the guidance unconditionally into the generation prompt', () => {
    const fullPrompt = source.slice(source.indexOf('const fullPrompt'), source.indexOf('\n', source.indexOf('const fullPrompt')))
    expect(fullPrompt).not.toContain('buildTechnicalInteractionGuidance()')
  })

  it('declares evaluatedSpecs before the prompt that depends on it', () => {
    expect(source.indexOf('const evaluatedSpecs = selectEvaluatedSpecs(safeReferenceUrls)'))
      .toBeLessThan(source.indexOf('const fullPrompt'))
  })
})
