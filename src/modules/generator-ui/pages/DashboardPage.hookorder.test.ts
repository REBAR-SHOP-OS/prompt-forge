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
