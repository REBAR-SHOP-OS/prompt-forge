import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dashboardSource = readFileSync(
  resolve(process.cwd(), 'src/modules/generator-ui/pages/DashboardPage.tsx'),
  'utf8',
)

function deleteCardSource(): string {
  const start = dashboardSource.indexOf('async function deleteCardConfirmed(')
  const end = dashboardSource.indexOf('const pollTimerRef', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return dashboardSource.slice(start, end)
}

describe('DashboardPage merged-film storage purge', () => {
  it('awaits the error-checking purge inside the try whose catch rolls the card back', () => {
    const source = deleteCardSource()
    const tryIndex = source.lastIndexOf('try {')
    const purgeIndex = source.indexOf('await purgeMergedFilmStorage(')
    const catchIndex = source.indexOf('} catch (err) {', tryIndex)

    expect(purgeIndex).toBeGreaterThan(tryIndex)
    expect(catchIndex).toBeGreaterThan(purgeIndex)
    expect(source.slice(catchIndex)).toContain('if (isMerged) setMergedEntries(prevMerged)')
  })

  it('never ignores the result of a storage remove() call', () => {
    // Supabase Storage reports failures in the returned { error } instead of
    // throwing, so a bare awaited remove() silently skips the rollback.
    expect(deleteCardSource()).not.toMatch(/await supabase\.storage\.from\([^)]*\)\.remove\(/)
  })
})
