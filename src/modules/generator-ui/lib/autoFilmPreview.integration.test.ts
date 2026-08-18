import { describe, expect, it } from 'vitest'
import dashboardSource from '@/modules/generator-ui/pages/DashboardPage.tsx?raw'
import playerSource from '@/modules/generator-ui/components/SequentialClipPlayer.tsx?raw'

function functionBody(source: string, name: string, nextName: string): string {
  const start = source.indexOf(`async function ${name}`)
  const end = source.indexOf(`async function ${nextName}`, start + 1)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

function sourceBetween(source: string, startText: string, endText: string): string {
  const start = source.indexOf(startText)
  const end = source.indexOf(endText, start + startText.length)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('Make Full Film automatic Preview integration', () => {
  it('opens only from the user-started approved-film batch path', () => {
    const renderBody = functionBody(
      dashboardSource,
      'renderApprovedFilm',
      'captureLastFrameAsBlob',
    )

    expect(renderBody).toContain('waitForAutoFilmBatch(createdJobIds)')
    expect(renderBody).toContain('suppressPreviewUntilBatchSettles: true')
    expect(renderBody).toContain("type: 'batch-settled'")
    expect(renderBody).toContain('clips: batch.completed')
    expect(renderBody).toContain('setPreviewDismissed(false)')
  })

  it('never invokes Final Film merge from the automatic Preview path', () => {
    const renderBody = functionBody(
      dashboardSource,
      'renderApprovedFilm',
      'captureLastFrameAsBlob',
    )

    expect(renderBody).not.toContain('handleMergeAllVideos')
    expect(dashboardSource).not.toContain('handleMergeAllVideosRef')
    expect(dashboardSource).toContain('onClick={handleMergeAllVideos}')
  })

  it('keeps the automatic play attempt keyed once and exposes manual play fallback', () => {
    expect(playerSource).toContain('autoPlayAttemptedRef.current !== autoPlayAttemptId')
    expect(playerSource).toContain('setIsPlaying(false)')
    expect(playerSource).toContain("aria-label={isPlaying ? 'Pause' : 'Play'}")
    expect(playerSource).toContain("videoRef.current?.play().catch(() => setIsPlaying(false))")
    expect(playerSource).not.toContain('setIsPlaying((playing) =>')
  })

  it('clears active auto Preview from Start Over and manual Preview without reviving it', () => {
    const resetBody = sourceBetween(
      dashboardSource,
      'function resetWorkspace',
      'async function handleStartOver',
    )
    const manualPreviewButton = sourceBetween(
      dashboardSource,
      'const hasReadyClips = playableSequenceClips.length > 0',
      '<AlertDialog>',
    )

    expect(resetBody).toContain("dispatchAutoFilmPreview({ type: 'clear-active' })")
    expect(manualPreviewButton).toContain("dispatchAutoFilmPreview({ type: 'clear-active' })")
    expect(manualPreviewButton).toContain('setPreviewDismissed(false)')
  })
})
