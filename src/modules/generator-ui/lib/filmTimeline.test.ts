import { describe, expect, it } from 'vitest'
import { firstProjectFilmFrameUrl, shiftAudioTimelineAfterCover } from './filmTimeline'

describe('firstProjectFilmFrameUrl', () => {
  it('selects the earliest playable project film even when a reopened snapshot is newest-first', () => {
    expect(firstProjectFilmFrameUrl([
      { created_at: '2026-09-21T12:00:00Z', video: { storage_path: 'last.mp4' } },
      { created_at: '2026-09-21T10:00:00Z', video: { storage_path: 'first.mp4' } },
    ])).toBe('first.mp4')
  })

  it('skips films without a playable storage path', () => {
    expect(firstProjectFilmFrameUrl([
      { created_at: '2026-09-21T09:00:00Z', video: null },
      { created_at: '2026-09-21T10:00:00Z', video: { storage_path: 'first-playable.mp4' } },
    ])).toBe('first-playable.mp4')
  })
})

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
