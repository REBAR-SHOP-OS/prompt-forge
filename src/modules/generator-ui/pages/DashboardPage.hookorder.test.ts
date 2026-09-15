import { describe, it, expect } from 'vitest'
// ?raw import is resolved by Vite at bundle/transform time — no node:fs, node:path,
// or __dirname needed at runtime. Works identically in jsdom and node environments,
// and is portable across Node versions (no CJS-default-export TDZ in jsdom).
import source from './DashboardPage.tsx?raw'

// Regression for: "Cannot access 'Q' before initialization" production crash.
// The minified prod bundle exposes a TDZ error when const [localStatus] = useState(...)
// is declared AFTER const pickerModels = useMemo(..., [localStatus?.status]).
// The dep array is evaluated eagerly by useMemo(); reading a const before its
// declaration throws in native-const bundles (modern browsers) even though
// dev builds (transpiled to var) silently treat it as undefined.
describe('DashboardPage hook declaration order', () => {
  it('declares localStatus before pickerModels to avoid TDZ crash in production', () => {
    const lines = source.split('\n')
    const localStatusLine = lines.findIndex((l) =>
      l.includes('const [localStatus, setLocalStatus] = useState'),
    )
    const pickerModelsLine = lines.findIndex((l) =>
      l.includes('const pickerModels = useMemo'),
    )

    expect(localStatusLine).toBeGreaterThan(-1)
    expect(pickerModelsLine).toBeGreaterThan(-1)
    expect(localStatusLine).toBeLessThan(pickerModelsLine)
  })
})

describe('DashboardPage Make Full Film identity handoff', () => {
  // Every grouped product angle now reaches ai-image-edit (not a single
  // product + single character pair), so the literal ['product', 'character']
  // array is gone from this call site — buildSceneEditRequestBody (tested in
  // sceneComposition.test.ts) builds one 'product' role entry per angle
  // instead, character always last. This pins that DashboardPage actually
  // routes through that shared builder with the full grouped set and the
  // character-sheet flag, rather than reintroducing an inline single-pair array.
  it('routes the ai-image-edit call through buildSceneEditRequestBody with every grouped angle', () => {
    expect(source).toContain('buildSceneEditRequestBody({')
    expect(source).toContain('productUrls: productUrlList,')
    expect(source).toContain('characterSheet,')
    expect(source).not.toContain("referenceRoles: ['product', 'character']")
  })

  it('does not replace missing wizard snapshot values with current dashboard selections', () => {
    expect(source).toContain('generateFilmSceneImage(sceneText, aspect, productUrls, characterUrl, noText, creative, characterSheet)')
    expect(source).not.toContain('productUrls ?? selectedProduct?.urls, characterUrl ?? selectedCharacter?.url')
  })
})
