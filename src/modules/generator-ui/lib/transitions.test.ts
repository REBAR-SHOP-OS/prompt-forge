import { describe, expect, it } from 'vitest'
import {
  TRANSITION_GROUPS,
  TRANSITION_LABEL,
  DEFAULT_TRANSITION_DURATION,
  MIN_TRANSITION_MS,
  MAX_TRANSITION_MS,
  clampTransitionDuration,
  transitionSpecFor,
  applyTransitionToAll,
} from '@/modules/generator-ui/lib/transitions'

describe('transition catalog', () => {
  it('covers all seven engine transition ids exactly once', () => {
    const ids = TRANSITION_GROUPS.flatMap((g) => g.items.map((i) => i.id))
    expect(ids).toHaveLength(7)
    expect(new Set(ids).size).toBe(7)
    expect(ids.sort()).toEqual(
      ['crossfade', 'cut', 'fade', 'slide-left', 'slide-right', 'wipe', 'zoom'].sort(),
    )
  })

  it('groups transitions into Basic, Movement, Reveal, Dynamic', () => {
    expect(TRANSITION_GROUPS.map((g) => g.group)).toEqual([
      'Basic',
      'Movement',
      'Reveal',
      'Dynamic',
    ])
  })

  it('provides a label and default duration for every id', () => {
    for (const g of TRANSITION_GROUPS) {
      for (const item of g.items) {
        expect(TRANSITION_LABEL[item.id]).toBeTruthy()
        expect(DEFAULT_TRANSITION_DURATION[item.id]).toBeTypeOf('number')
      }
    }
  })

  it('keeps cut at zero duration', () => {
    expect(DEFAULT_TRANSITION_DURATION.cut).toBe(0)
  })
})

describe('clampTransitionDuration', () => {
  it('clamps below the safe minimum', () => {
    expect(clampTransitionDuration(10)).toBe(MIN_TRANSITION_MS)
  })

  it('clamps above the safe maximum', () => {
    expect(clampTransitionDuration(99999)).toBe(MAX_TRANSITION_MS)
  })

  it('rounds fractional values', () => {
    expect(clampTransitionDuration(333.4)).toBe(333)
  })

  it('falls back to 500ms for non-finite input', () => {
    expect(clampTransitionDuration(Number.NaN)).toBe(500)
    expect(clampTransitionDuration(Number.POSITIVE_INFINITY)).toBe(500)
  })
})

describe('transitionSpecFor', () => {
  it('returns a zero-duration cut regardless of requested duration', () => {
    expect(transitionSpecFor('cut', 800)).toEqual({ id: 'cut', durationMs: 0 })
  })

  it('uses the catalog default when no duration is given', () => {
    expect(transitionSpecFor('fade')).toEqual({ id: 'fade', durationMs: 500 })
  })

  it('clamps an explicit duration into the safe range', () => {
    expect(transitionSpecFor('zoom', 50)).toEqual({ id: 'zoom', durationMs: MIN_TRANSITION_MS })
    expect(transitionSpecFor('wipe', 5000)).toEqual({ id: 'wipe', durationMs: MAX_TRANSITION_MS })
  })
})

describe('applyTransitionToAll', () => {
  it('applies the spec to every gap id and preserves unrelated entries', () => {
    const current = { a: { id: 'fade' as const, durationMs: 500 } }
    const next = applyTransitionToAll(current, ['a', 'b', 'c'], { id: 'zoom', durationMs: 800 })
    expect(next).toEqual({
      a: { id: 'zoom', durationMs: 800 },
      b: { id: 'zoom', durationMs: 800 },
      c: { id: 'zoom', durationMs: 800 },
    })
  })

  it('does not mutate the input object', () => {
    const current = { a: { id: 'fade' as const, durationMs: 500 } }
    applyTransitionToAll(current, ['a'], { id: 'wipe', durationMs: 300 })
    expect(current.a).toEqual({ id: 'fade', durationMs: 500 })
  })
})
