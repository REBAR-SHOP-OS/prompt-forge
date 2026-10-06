import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/modules/generator-ui/components/MakeFilmWizardDialog.tsx'),
  'utf8',
)

describe('Make Full Film scenario review', () => {
  it('reviews one unified scenario instead of rebuilding shot headings', () => {
    expect(source).toContain("const unifiedScenario = useMemo(() => plans[0]?.scenarioText ?? '', [plans])")
    expect(source).toContain('{reviewTranslation ?? unifiedScenario}')
    expect(source).not.toContain('buildUnifiedScenario(plans)')
  })

  it('updates every internal Wan slot when the user edits the one scenario', () => {
    expect(source).toContain('current.map((plan) => ({ ...plan, scenarioText }))')
    expect(source).toContain('setStoryboardSheetUrl(null)')
  })
})
