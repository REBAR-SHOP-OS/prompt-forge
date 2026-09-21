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

  it('uses the earliest playable project film for Use film frame', () => {
    expect(dashboardSource).toContain('() => firstProjectFilmFrameUrl(displayedVideos)')
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
