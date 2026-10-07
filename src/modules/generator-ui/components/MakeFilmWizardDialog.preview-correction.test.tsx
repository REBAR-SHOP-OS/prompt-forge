import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/modules/generator-ui/components/MakeFilmWizardDialog.tsx'),
  'utf8',
)

describe('Make Full Film single storyboard generation', () => {
  it('does not run the removed per-shot preview generation loop', () => {
    expect(source).not.toContain('generateCheckedPreviewShot')
    expect(source).not.toContain('film-preview-quality')
    expect(source).not.toContain('Designing and checking preview image')
  })

  it('passes the complete scenario and slot count to the one storyboard prompt', () => {
    expect(source).toContain('buildStoryboardSheetPrompt({ scenario, panelCount: plans.length, durationSeconds: duration })')
    expect(source).toContain('Designing one storyboard with')
    expect(source).toContain('× 5-second slots')
  })
})
