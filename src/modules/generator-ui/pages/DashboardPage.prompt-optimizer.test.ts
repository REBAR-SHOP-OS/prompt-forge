import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/modules/generator-ui/pages/DashboardPage.tsx', 'utf8')

function promptPopupWiring(): string {
  const start = source.indexOf('<PromptOptimizerPopover')
  const end = source.indexOf('aria-label="Generate video"', start)
  if (start < 0 || end < 0) throw new Error('Prompt optimizer composer wiring not found')
  return source.slice(start, end)
}

describe('DashboardPage Prompt optimizer integration', () => {
  it('wires the focused popup into the bottom composer and returns the enhanced prompt', () => {
    const popup = promptPopupWiring()
    expect(popup).toContain('initialPrompt={promptText}')
    expect(popup).toContain('durationSeconds={durationSeconds}')
    expect(popup).toContain('onOptimize={runEnhancePrompt}')

    const handlerStart = source.indexOf('const runEnhancePrompt = async')
    const handlerEnd = source.indexOf('const startUploadCount', handlerStart)
    const handler = source.slice(handlerStart, handlerEnd)
    expect(handler).toContain('setPromptText(enhanced)')
    expect(handler).toContain('setIsPromptMenuOpen(false)')
  })

  it('forwards the duration selected by the optimizer to enhance-prompt', () => {
    const handlerStart = source.indexOf('const runEnhancePrompt = async')
    const handlerEnd = source.indexOf('const startUploadCount', handlerStart)
    const handler = source.slice(handlerStart, handlerEnd)
    expect(handler).toContain('duration: request.duration')

    const rewriteStart = source.indexOf('async function rewriteVideoPrompt')
    const rewriteEnd = source.indexOf('// Cost preview / confirm dialog state', rewriteStart)
    const rewrite = source.slice(rewriteStart, rewriteEnd)
    expect(rewrite).toContain('duration: params.duration')
    expect(rewrite).toContain("supabase.functions.invoke('enhance-prompt', { body })")
  })

  it('removes product-scenario writing only from the Prompt popup', () => {
    const popup = promptPopupWiring()
    expect(popup).not.toContain('Scenario for this product')
    expect(popup).not.toContain('runProductScenario')
    expect(source).not.toContain('const runProductScenario')
  })

  it('preserves the separate Scenario and Make Full Film surfaces', () => {
    expect(source).toContain('<ScenarioWriterDialog')
    expect(source).toContain('aria-label="Write a scenario from your idea"')
    expect(source).toContain('<MakeFilmWizardDialog')
    expect(source).toContain('aria-label="Open the Make Full Film review wizard"')
  })
})
