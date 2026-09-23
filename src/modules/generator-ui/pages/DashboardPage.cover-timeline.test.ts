import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dashboardSource = readFileSync(
  resolve(process.cwd(), 'src/modules/generator-ui/pages/DashboardPage.tsx'),
  'utf8',
)

function section(startMarker: string, endMarker: string): string {
  const start = dashboardSource.indexOf(startMarker)
  const end = dashboardSource.indexOf(endMarker, start + startMarker.length)
  if (start < 0 || end < 0) throw new Error(`Could not find source section: ${startMarker}`)
  return dashboardSource.slice(start, end)
}

describe('Dashboard cover lifecycle and soundtrack contract', () => {
  it('moves the cover into a reopened draft instead of orphaning it on the removed final id', () => {
    const reopen = section('function reopenFinalAsDraft', 'const restoreDraftAudio')
    expect(reopen).toContain('moveCoverBetweenScopes(prev, finalId, draftId)')
    expect(reopen).toContain('moveCoverDurationBetweenScopes(prev, finalId, draftId)')
  })

  it('moves the draft cover onto the Final Film lifecycle id before resetting the workspace', () => {
    const merge = section('async function handleMergeAllVideos()', 'function resetWorkspace')
    expect(merge).toContain('moveCoverBetweenScopes(prev, coverScopeKey, mergedId)')
    expect(merge).toContain('moveCoverDurationBetweenScopes(prev, coverScopeKey, mergedId)')
  })

  it('seeds Use film frame from the first playable video in Final Film render order', () => {
    // Render order is displayedClips' rule (oldest first, then manual drag order);
    // handleMergeAllVideos documents that it applies the same rule.
    const merge = section('async function handleMergeAllVideos()', 'function resetWorkspace')
    expect(merge).toContain('Apply the same ordering rule as displayedClips')
    const cover = section('const coverFilmFrameUrl', 'type PreviewItem')
    expect(cover).toContain('for (const clip of displayedClips)')
    expect(cover).toContain("clip.kind === 'video' && clip.job.video?.storage_path")
    expect(cover).toContain('}, [displayedClips])')
    // Declared after displayedClips (no temporal-dead-zone access).
    expect(dashboardSource.indexOf('const displayedClips = useMemo'))
      .toBeLessThan(dashboardSource.indexOf('const coverFilmFrameUrl'))
  })

  it('renders selected-project clips in their saved snapshot order without changing merge order', () => {
    const display = section('const displayedClips = useMemo', 'type PreviewItem')
    const selectedProjectGuard = display.indexOf('if (selectedProjectId)')
    const chronologicalSort = display.indexOf('const chronoAsc = items.sort')

    expect(selectedProjectGuard).toBeGreaterThan(-1)
    expect(display.slice(selectedProjectGuard, chronologicalSort)).toContain('return items')
    expect(selectedProjectGuard).toBeLessThan(chronologicalSort)

    const merge = section('async function handleMergeAllVideos()', 'function resetWorkspace')
    expect(merge).not.toContain('if (selectedProjectId) {\n      eligibleClips = [...baseClips]')
    expect(merge).toContain('let eligibleClips: UnifiedClip[] = chronoAsc')
  })

  it('keeps a finalized project cover when Start Over leaves a read-only Final view', () => {
    const reset = section('function resetWorkspace', 'async function handleStartOver')
    expect(reset).toContain('if (scopeKey && !isReadOnlyProject) {')
  })

  it('shifts music and voiceover after the cover that was actually rendered', () => {
    const merge = section('async function handleMergeAllVideos()', 'function resetWorkspace')
    expect(merge).toContain('let renderedCoverDuration = 0')
    expect(merge).toContain('renderedCoverDuration = currentCoverDuration')
    expect(merge).toContain('shiftAudioTimelineAfterCover(musicTimeline, renderedCoverDuration)')
    expect(merge).toContain('shiftAudioTimelineAfterCover(voiceoverTimeline, renderedCoverDuration)')
    expect(merge).toContain('timelineStartSec: shiftedMusicTimeline.timelineStartSec')
    expect(merge).toContain('timelineStartSec: shiftedVoiceoverTimeline.timelineStartSec')
  })
})
