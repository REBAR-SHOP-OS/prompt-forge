import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Regression for: "Cannot access 'Q' before initialization" production crash.
// The minified prod bundle exposes a TDZ error when const [localStatus] = useState(...)
// is declared AFTER const pickerModels = useMemo(..., [localStatus?.status]).
// The dep array is evaluated eagerly by useMemo(); reading a const before its
// declaration throws in native-const bundles (modern browsers) even though
// dev builds (transpiled to var) silently treat it as undefined.
const source = fs.readFileSync(
  path.resolve(__dirname, 'DashboardPage.tsx'),
  'utf-8',
)

describe('DashboardPage hook declaration order', () => {
  it('declares localStatus before pickerModels to avoid TDZ crash in production', () => {
    const localStatusLine = source
      .split('\n')
      .findIndex((l) => l.includes('const [localStatus, setLocalStatus] = useState'))
    const pickerModelsLine = source
      .split('\n')
      .findIndex((l) => l.includes('const pickerModels = useMemo'))

    expect(localStatusLine).toBeGreaterThan(-1)
    expect(pickerModelsLine).toBeGreaterThan(-1)
    expect(localStatusLine).toBeLessThan(pickerModelsLine)
  })
})
