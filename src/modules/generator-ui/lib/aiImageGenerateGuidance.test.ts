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
    // Robust to reformatting: the helper may be called exactly once in the file
    // (excluding its import), and that one call must be the conditional
    // interactionGuidance assignment.
    const withoutImports = source.replace(/^import[\s\S]*?from\s+["'][^"']+["'];?$/gm, '')
    const calls = withoutImports.match(/buildTechnicalInteractionGuidance\(\)/g) ?? []
    expect(calls).toHaveLength(1)
    const assignment = withoutImports.slice(
      withoutImports.indexOf('const interactionGuidance'),
      withoutImports.indexOf('const fullPrompt'),
    )
    expect(assignment).toContain('buildTechnicalInteractionGuidance()')
    expect(assignment).toContain('evaluatedSpecs.length > 0')
  })

  it('declares evaluatedSpecs before the prompt that depends on it', () => {
    expect(source.indexOf('const evaluatedSpecs = selectEvaluatedSpecs(safeReferenceUrls)'))
      .toBeLessThan(source.indexOf('const fullPrompt'))
  })
})
