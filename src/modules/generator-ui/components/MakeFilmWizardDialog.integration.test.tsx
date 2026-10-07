import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/modules/generator-ui/components/MakeFilmWizardDialog.tsx'),
  'utf8',
)

describe('MakeFilmWizardDialog unified film contract', () => {
  it('requests a unified scenario instead of exposed shot blocks', () => {
    expect(source).toContain("unit: 'film' as const")
    expect(source).toContain('aria-label="Full film scenario"')
    expect(source).toContain('do not split, number, label, timestamp, or list shots')
    expect(source).not.toContain('Edit any scene, then generate one preview image per scene.')
  })

  it('generates and displays exactly one storyboard image', () => {
    const start = source.indexOf('async function handleGenerateImages()')
    const end = source.indexOf('async function handleRegenerate()', start)
    const handler = source.slice(start, end)

    expect(handler).toContain('const sheetUrl = await generateStoryboardSheet(snapshot)')
    expect(handler).toContain('setImages(new Array(plans.length).fill(sheetUrl))')
    expect(handler).not.toMatch(/for\s*\(/)
    expect(source).toContain('alt="Full film storyboard"')
    expect(source).toContain('Generate storyboard')
  })

  it('approves the same single sheet for every internal 5-second slot', () => {
    expect(source).toContain('const shotImageUrls = Array.from({ length: scenes.length }, () => sheetUrl)')
    expect(source).toContain('storyboardSheetUrl')
  })
})
