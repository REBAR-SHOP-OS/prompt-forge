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
  it('automatically assembles the exact approved scene batch after quality passes', () => {
    const approvedFilmFlow = functionSource('renderApprovedFilm', 'captureLastFrameAsBlob')

    expect(approvedFilmFlow).toContain('const approvedJobs = createdJobIds')
    expect(approvedFilmFlow).toContain('await handleMergeAllVideos(approvedJobs)')
    expect(approvedFilmFlow).toContain('qualityBatch.allPassed')
  })

  it('keeps the existing manual Final Film handler wired to its button', () => {
    expect(dashboardSource).toContain('async function handleMergeAllVideos(): Promise<void>')
    expect(dashboardSource).toContain('async function handleMergeAllVideos(approvedJobs: readonly JobDetail[]): Promise<void>')
    expect(dashboardSource).toContain('onClick={() => { void handleMergeAllVideos() }}')
  })

  it('keeps automatic assembly isolated and ordered without redrawing the approved sheet', () => {
    const mergeFlow = functionSource('handleMergeAllVideos', 'handleStartOver')

    expect(mergeFlow).toContain('if (approvedJobs) {')
    expect(mergeFlow).toContain('const chronoAsc = approvedJobs')
    expect(mergeFlow).toContain('if (!approvedJobs && manualOrder)')
    expect(dashboardSource).toContain('!startFrameIsStoryboardSheet')
  })

  it('chains 30s+ wizard cards while preserving independent short-film queueing', () => {
    expect(dashboardSource).toContain(
      'const requiresSequentialContinuity = isWizardSceneBatch && totalDuration >= 30',
    )
    expect(dashboardSource).toContain('if (requiresSequentialContinuity) {')
    expect(dashboardSource).toContain('queueSequentialSceneBatch(')
    expect(dashboardSource).toContain(
      '(jobId, sceneIndex) => waitForLastFrameUrl(jobId, `Scene ${sceneIndex + 1}`)',
    )
    expect(dashboardSource).toContain('startFrameUrl = previousLastFrameUrl')
    expect(dashboardSource).toContain('totalDuration >= 30 ||')
    expect(dashboardSource).toContain('} else if (isIndependentSceneBatch) {')
  })
})
