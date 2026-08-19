import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dashboardSource = readFileSync(
  resolve(process.cwd(), 'src/modules/generator-ui/pages/DashboardPage.tsx'),
  'utf8',
)

function functionSource(name: string, nextName: string): string {
  const start = dashboardSource.indexOf(`async function ${name}`)
  const end = dashboardSource.indexOf(`async function ${nextName}`, start + 1)
  if (start < 0 || end < 0) throw new Error(`Could not find ${name} source boundary`)
  return dashboardSource.slice(start, end)
}

describe('Final Film flow contract', () => {
  it('does not invoke Final Film merge after the approved scene batch', () => {
    const approvedFilmFlow = functionSource('renderApprovedFilm', 'captureLastFrameAsBlob')

    expect(approvedFilmFlow).not.toContain('handleMergeAllVideos')
    expect(approvedFilmFlow).toContain('Use Final Film when you are ready to assemble them.')
  })

  it('keeps the existing manual Final Film handler wired to its button', () => {
    expect(dashboardSource).toContain('async function handleMergeAllVideos()')
    expect(dashboardSource).toContain('onClick={handleMergeAllVideos}')
  })

  it('guards last-frame chaining out of wizard batches', () => {
    expect(dashboardSource).toContain('if (!isIndependentSceneBatch && i > 0 && previousJobId)')
    expect(dashboardSource).toContain('if (!isIndependentSceneBatch) previousJobId = seededJob.id')
    expect(dashboardSource).toContain('startFrameUrl = i === 0 ? firstSceneImageUrl : undefined')
  })
})
