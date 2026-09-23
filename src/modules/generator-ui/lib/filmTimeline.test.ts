import { describe, expect, it } from 'vitest'
import { shiftAudioTimelineAfterCover } from './filmTimeline'

describe('shiftAudioTimelineAfterCover', () => {
  it('starts full-length music after the rendered cover', () => {
    expect(shiftAudioTimelineAfterCover([0, 0], 3)).toEqual({
      timelineStartSec: 3,
      timelineEndSec: undefined,
    })
  })

  it('shifts explicit music or voiceover placement by the cover duration', () => {
    expect(shiftAudioTimelineAfterCover([2, 8], 3)).toEqual({
      timelineStartSec: 5,
      timelineEndSec: 11,
    })
  })

  it('keeps the existing timeline when no cover was rendered', () => {
    expect(shiftAudioTimelineAfterCover([2, 8], 0)).toEqual({
      timelineStartSec: 2,
      timelineEndSec: 8,
    })
  })
})
