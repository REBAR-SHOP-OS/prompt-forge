import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appendPreviewQualityCorrection } from './previewPromptCorrection'

const dashboardSource = readFileSync(
  resolve(process.cwd(), 'src/modules/generator-ui/pages/DashboardPage.tsx'),
  'utf8',
)

describe('appendPreviewQualityCorrection', () => {
  it('appends the reviewer correction to the rewritten prompt that reaches the generator', () => {
    const rewritten = 'Polished image prompt returned by write-image-prompt.'
    const correction = 'QUALITY CORRECTION: Keep both hands attached to the stirrup.'

    expect(appendPreviewQualityCorrection(rewritten, correction)).toBe(
      `${rewritten}\n\n${correction}`,
    )
  })

  it('leaves the rewritten prompt unchanged when no correction is requested', () => {
    expect(appendPreviewQualityCorrection('Rewritten prompt', '   ')).toBe('Rewritten prompt')
    expect(appendPreviewQualityCorrection('Rewritten prompt')).toBe('Rewritten prompt')
  })

  it('is wired after prompt rewriting and before both image generator paths', () => {
    const functionStart = dashboardSource.indexOf('async function generateFilmSceneImage(')
    const functionEnd = dashboardSource.indexOf('async function renderApprovedFilm(', functionStart)
    expect(functionStart).toBeGreaterThanOrEqual(0)
    expect(functionEnd).toBeGreaterThan(functionStart)

    const generationFlow = dashboardSource.slice(functionStart, functionEnd)
    const rewriteIndex = generationFlow.indexOf("supabase.functions.invoke('write-image-prompt'")
    const correctionIndex = generationFlow.indexOf(
      'imagePrompt = appendPreviewQualityCorrection(imagePrompt, correction)',
    )
    const editIndex = generationFlow.indexOf("supabase.functions.invoke('ai-image-edit'")
    const generateIndex = generationFlow.indexOf("supabase.functions.invoke('ai-image-generate'")

    expect(rewriteIndex).toBeGreaterThanOrEqual(0)
    expect(correctionIndex).toBeGreaterThan(rewriteIndex)
    expect(editIndex).toBeGreaterThan(correctionIndex)
    expect(generateIndex).toBeGreaterThan(correctionIndex)
  })
})
