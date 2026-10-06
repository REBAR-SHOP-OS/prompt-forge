import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/modules/generator-ui/components/MakeFilmWizardDialog.tsx'),
  'utf8',
)

describe('Make Full Film storyboard regeneration', () => {
  it('regenerates the one sheet and replaces every slot reference atomically', () => {
    const start = source.indexOf('async function handleRegenerate()')
    const end = source.indexOf('function handleEditedImageSaved', start)
    const handler = source.slice(start, end)

    expect(handler).toContain('const sheetUrl = await generateStoryboardSheet(snapshot)')
    expect(handler).toContain('setStoryboardSheetUrl(sheetUrl)')
    expect(handler).toContain('setImages(new Array(plans.length).fill(sheetUrl))')
    expect(handler).toContain('setSheetRevision((revision) => revision + 1)')
    expect(handler).not.toContain('shotIndex')
  })

  it('regenerates the scenario as one continuous text', () => {
    expect(source).toContain("const previousScenario = plans[0]?.scenarioText ?? ''")
    expect(source).toContain("buildUnifiedFilmPlans(duration, rawScenes.join(' '), undefined)")
  })
})
