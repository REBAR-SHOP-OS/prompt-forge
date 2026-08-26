import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
// ?raw import is resolved by Vite at transform time — no node:fs needed for TSX.
import source from './DashboardPage.tsx?raw'

// Vitest does not resolve `?raw` for CSS files (returns empty), so read the
// stylesheet directly from disk for the token assertions.
const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8')

/**
 * Slice the stylesheet between two markers, failing loudly when a marker is
 * missing. `String.indexOf` returns -1 when a selector is renamed, and
 * `slice(0, -1)` then quietly returns almost the whole file - so a token
 * defined only in a dark block would still satisfy a ":root defines X"
 * assertion. That is a false green, which is worse than no test at all.
 */
function cssBlock(startMarker: string, endMarker: string, searchFrom = 0): string {
  const start = css.indexOf(startMarker, searchFrom)
  if (start === -1) throw new Error(`index.css: marker not found: ${startMarker}`)
  const end = css.indexOf(endMarker, start)
  if (end === -1) throw new Error(`index.css: marker not found after ${startMarker}: ${endMarker}`)
  return css.slice(start, end)
}

// Regression coverage for the Light Theme readability fix. The warm ivory
// light theme previously had no --action-* values in :root, so every
// action-* Tailwind class resolved to an undefined CSS variable (transparent),
// and DashboardPage still carried hardcoded dark-mode light-shade text colors
// (text-emerald-200, text-violet-200, text-rose-200, etc.) that washed out on
// the light background.
describe('DashboardPage light-theme contrast', () => {
  it('the block markers this file relies on still exist', () => {
    // Synthetic control: if index.css is restructured, these throw here with a
    // clear message instead of silently widening every slice below.
    expect(() => cssBlock(':root', '.dark {')).not.toThrow()
    expect(() => cssBlock('.dark,', '@layer base')).not.toThrow()
    expect(() => cssBlock(':root', 'this-selector-does-not-exist')).toThrow(/marker not found/)
  })

  it('defines every --action-* token in the :root (light) block', () => {
    const rootBlock = cssBlock(':root', '.dark {')
    for (const token of [
      '--action-cyan',
      '--action-cyan-strong',
      '--action-violet',
      '--action-violet-strong',
      '--action-orange',
      '--action-orange-strong',
      '--action-emerald',
      '--action-emerald-strong',
      '--action-yellow',
      '--action-yellow-strong',
      '--action-rose',
      '--action-rose-strong',
    ]) {
      expect(rootBlock).toContain(token)
    }
  })

  it('defines a --danger token in the :root (light) block', () => {
    const rootBlock = cssBlock(':root', '.dark {')
    expect(rootBlock).toContain('--danger')
  })

  it('keeps the bright action palette on dark-oriented themes', () => {
    const darkBlock = cssBlock('.dark,', '@layer base')
    for (const token of ['--action-cyan', '--action-violet', '--action-emerald', '--action-rose']) {
      expect(darkBlock).toContain(token)
    }
  })

  it('has no hardcoded dark-mode light-shade text colors left in DashboardPage', () => {
    const forbidden = [
      'text-emerald-200',
      'text-emerald-100',
      'text-violet-200',
      'text-violet-100',
      'text-rose-200',
      'text-rose-100',
      'text-red-300',
      'text-red-200',
      'text-fuchsia-200',
      'text-fuchsia-100',
      'text-fuchsia-50',
    ]
    for (const cls of forbidden) {
      expect(source).not.toContain(cls)
    }
  })

  it('uses the semantic action token for the "Showing project" label', () => {
    expect(source).toContain('text-action-emerald/70')
  })
})
