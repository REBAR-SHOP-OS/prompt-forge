import { describe, expect, it, vi } from 'vitest'
import {
  musicGainAtFilmTime,
  resolveMusicFadeDurations,
  scheduleMusicFade,
} from './musicFade'

describe('music fade envelope', () => {
  it('preserves the existing constant volume when both fades are disabled', () => {
    expect(musicGainAtFilmTime({
      filmTimeSec: 4,
      timelineStartSec: 2,
      timelineEndSec: 8,
      volume: 0.7,
    })).toBeCloseTo(0.7)
    expect(musicGainAtFilmTime({
      filmTimeSec: 4,
      timelineStartSec: 0,
      timelineEndSec: Number.POSITIVE_INFINITY,
      volume: 0.7,
      fadeInSec: 2,
    })).toBeCloseTo(0.7)
  })

  it('fades linearly at both ends of the active music timeline', () => {
    const gainAt = (filmTimeSec: number) => musicGainAtFilmTime({
      filmTimeSec,
      timelineStartSec: 2,
      timelineEndSec: 12,
      volume: 0.8,
      fadeInSec: 2,
      fadeOutSec: 4,
    })
    expect(gainAt(2)).toBe(0)
    expect(gainAt(3)).toBeCloseTo(0.4)
    expect(gainAt(6)).toBeCloseTo(0.8)
    expect(gainAt(10)).toBeCloseTo(0.4)
    expect(gainAt(12)).toBe(0)
  })

  it('proportionally clamps overlapping or invalid persisted fade values', () => {
    expect(resolveMusicFadeDurations(8, 4, 6)).toEqual({ fadeInSec: 4, fadeOutSec: 2 })
    expect(resolveMusicFadeDurations(Number.NaN, -2, 6)).toEqual({ fadeInSec: 0, fadeOutSec: 0 })
  })

  it('schedules the same envelope for offline final-film rendering', () => {
    const gain = {
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    } as unknown as AudioParam
    scheduleMusicFade(gain, {
      timelineStartSec: 3,
      timelineEndSec: 13,
      volume: 0.75,
      fadeInSec: 2,
      fadeOutSec: 3,
    })
    expect(gain.cancelScheduledValues).toHaveBeenCalledWith(3)
    expect(gain.setValueAtTime).toHaveBeenNthCalledWith(1, 0, 3)
    expect(gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, 0.75, 5)
    expect(gain.setValueAtTime).toHaveBeenNthCalledWith(2, 0.75, 10)
    expect(gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(2, 0, 13)
  })
})
