import { describe, expect, it } from 'vitest'
import { resolveMusicTimelineEnd } from './musicTimeline'

const base = {
  hasMusic: true,
  hasMusicRange: true,
}

describe('resolveMusicTimelineEnd', () => {
  it('auto-extends a full-length music timeline when the project grows', () => {
    // Film 10s + Music 0–10s → add clip → Film 15s → Music 0–15s.
    expect(
      resolveMusicTimelineEnd({
        ...base,
        prevDurationSec: 10,
        nextDurationSec: 15,
        timeline: [0, 10],
      }),
    ).toBe(15)
  })

  it('auto-extends an unset timeline ([0,0]) to the new full length', () => {
    expect(
      resolveMusicTimelineEnd({
        ...base,
        prevDurationSec: 10,
        nextDurationSec: 15,
        timeline: [0, 0],
      }),
    ).toBe(15)
  })

  it('preserves a manually-shortened timeline', () => {
    // User deliberately trimmed the end to 6s — do not touch it.
    expect(
      resolveMusicTimelineEnd({
        ...base,
        prevDurationSec: 10,
        nextDurationSec: 15,
        timeline: [0, 6],
      }),
    ).toBeNull()
  })

  it('preserves a manually-shortened timeline with a non-zero start', () => {
    expect(
      resolveMusicTimelineEnd({
        ...base,
        prevDurationSec: 10,
        nextDurationSec: 15,
        timeline: [2, 8],
      }),
    ).toBeNull()
  })

  it('does nothing when the project did not grow', () => {
    expect(
      resolveMusicTimelineEnd({
        ...base,
        prevDurationSec: 10,
        nextDurationSec: 10,
        timeline: [0, 10],
      }),
    ).toBeNull()
  })

  it('does nothing when there is no music', () => {
    expect(
      resolveMusicTimelineEnd({
        ...base,
        hasMusic: false,
        prevDurationSec: 10,
        nextDurationSec: 15,
        timeline: [0, 10],
      }),
    ).toBeNull()
  })

  it('does nothing when the music range is invalid', () => {
    expect(
      resolveMusicTimelineEnd({
        ...base,
        hasMusicRange: false,
        prevDurationSec: 10,
        nextDurationSec: 15,
        timeline: [0, 10],
      }),
    ).toBeNull()
  })

  it('handles multiple consecutive clip additions', () => {
    // 10 → 15 → 20: each growth re-extends the full-length timeline.
    expect(
      resolveMusicTimelineEnd({ ...base, prevDurationSec: 10, nextDurationSec: 15, timeline: [0, 10] }),
    ).toBe(15)
    expect(
      resolveMusicTimelineEnd({ ...base, prevDurationSec: 15, nextDurationSec: 20, timeline: [0, 15] }),
    ).toBe(20)
  })
})
