import { describe, expect, it } from 'vitest'
import {
  clampOffset,
  computeSafeRect,
  loadPreviewOffset,
  previewOffsetStorageKey,
  savePreviewOffset,
  SAFE_MARGIN,
  ZERO_OFFSET,
  DEFAULT_OFFSET,
  type Rect,
} from './previewPosition'

const frame: Rect = { left: 400, top: 200, right: 600, bottom: 500 }
const viewport: Rect = { left: 0, top: 0, right: 1000, bottom: 800 }

describe('SAFE_MARGIN', () => {
  it('is a small positive number', () => {
    expect(SAFE_MARGIN).toBeGreaterThan(0)
    expect(SAFE_MARGIN).toBeLessThan(20)
  })
})

describe('clampOffset', () => {
  it('keeps an in-bounds offset unchanged', () => {
    const safe = computeSafeRect(viewport, null, null, null)
    expect(clampOffset({ x: 50, y: 30 }, frame, safe)).toEqual({ x: 50, y: 30 })
  })

  it('clamps an offset that would push the frame past the right edge', () => {
    const safe = computeSafeRect(viewport, null, null, null)
    // maxX = (1000 - SAFE_MARGIN) - 600 = 992 - 600 = 392
    expect(clampOffset({ x: 999, y: 0 }, frame, safe).x).toBe(992 - 600)
  })

  it('clamps an offset that would push the frame past the left edge', () => {
    const safe = computeSafeRect(viewport, null, null, null)
    // minX = SAFE_MARGIN - 400 = 8 - 400 = -392
    expect(clampOffset({ x: -999, y: 0 }, frame, safe).x).toBe(SAFE_MARGIN - 400)
  })

  it('clamps vertically against the composer top', () => {
    const composer: Rect = { left: 0, top: 700, right: 1000, bottom: 800 }
    const safe = computeSafeRect(viewport, null, null, composer)
    // maxY = (700 - SAFE_MARGIN) - 500 = 692 - 500 = 192
    expect(clampOffset({ x: 0, y: 999 }, frame, safe).y).toBe(700 - SAFE_MARGIN - 500)
  })

  it('forces offset to 0 when the safe area is narrower than the frame', () => {
    const tiny: Rect = { left: 0, top: 0, right: 150, bottom: 800 }
    const safeTiny = computeSafeRect(tiny, null, null, null)
    // safe width = 150 - 2*SAFE_MARGIN = 134 < frame width 200 → x forced to 0
    expect(clampOffset({ x: 10, y: 10 }, frame, safeTiny)).toEqual({ x: 0, y: 10 })
  })
})

describe('computeSafeRect', () => {
  it('applies SAFE_MARGIN to all edges with no overlays', () => {
    const safe = computeSafeRect(viewport, null, null, null)
    expect(safe).toEqual({
      left: SAFE_MARGIN,
      top: SAFE_MARGIN,
      right: 1000 - SAFE_MARGIN,
      bottom: 800 - SAFE_MARGIN,
    })
  })

  it('shrinks the right edge to the right sidebar (minus margin)', () => {
    const right: Rect = { left: 800, top: 0, right: 1000, bottom: 800 }
    const safe = computeSafeRect(viewport, right, null, null)
    expect(safe.right).toBe(800 - SAFE_MARGIN)
  })

  it('shrinks the left edge to the left sidebar (plus margin)', () => {
    const left: Rect = { left: 0, top: 0, right: 200, bottom: 800 }
    const safe = computeSafeRect(viewport, null, left, null)
    expect(safe.left).toBe(200 + SAFE_MARGIN)
  })

  it('shrinks the bottom edge to the composer (minus margin)', () => {
    const composer: Rect = { left: 0, top: 700, right: 1000, bottom: 800 }
    const safe = computeSafeRect(viewport, null, null, composer)
    expect(safe.bottom).toBe(700 - SAFE_MARGIN)
  })

  it('shrinks the top edge to the header bottom (plus margin)', () => {
    const header: Rect = { left: 0, top: 0, right: 1000, bottom: 76 }
    const safe = computeSafeRect(viewport, null, null, null, header)
    expect(safe.top).toBe(76 + SAFE_MARGIN)
  })

  it('ignores an absent header (null)', () => {
    const safe = computeSafeRect(viewport, null, null, null, null)
    expect(safe.top).toBe(SAFE_MARGIN)
  })

  it('ignores absent overlays', () => {
    const safe = computeSafeRect(viewport, null, null, null)
    expect(safe).toEqual({
      left: SAFE_MARGIN,
      top: SAFE_MARGIN,
      right: 1000 - SAFE_MARGIN,
      bottom: 800 - SAFE_MARGIN,
    })
  })

  it('combines header and composer bounds', () => {
    const header: Rect = { left: 0, top: 0, right: 1000, bottom: 76 }
    const composer: Rect = { left: 0, top: 700, right: 1000, bottom: 800 }
    const safe = computeSafeRect(viewport, null, null, composer, header)
    expect(safe.top).toBe(76 + SAFE_MARGIN)
    expect(safe.bottom).toBe(700 - SAFE_MARGIN)
  })
})

describe('DEFAULT_OFFSET', () => {
  it('has a y value of 24', () => {
    expect(DEFAULT_OFFSET).toEqual({ x: 0, y: 24 })
  })

  it('is distinct from ZERO_OFFSET', () => {
    expect(DEFAULT_OFFSET).not.toEqual(ZERO_OFFSET)
  })
})

describe('persistence', () => {
  it('builds a per-user storage key', () => {
    expect(previewOffsetStorageKey('user-1')).toBe('generator:previewOffset:user-1')
  })

  it('round-trips an offset through localStorage', () => {
    savePreviewOffset('user-1', { x: 12, y: -34 })
    expect(loadPreviewOffset('user-1')).toEqual({ x: 12, y: -34 })
  })

  it('returns default offset when nothing is stored', () => {
    expect(loadPreviewOffset('user-none')).toEqual(DEFAULT_OFFSET)
  })

  it('returns default offset for a null user', () => {
    expect(loadPreviewOffset(null)).toEqual(DEFAULT_OFFSET)
  })

  it('ignores malformed stored JSON', () => {
    window.localStorage.setItem(previewOffsetStorageKey('user-bad'), '{not json')
    expect(loadPreviewOffset('user-bad')).toEqual(DEFAULT_OFFSET)
  })

  it('sanitizes non-numeric stored values to zeros', () => {
    window.localStorage.setItem(previewOffsetStorageKey('user-nan'), JSON.stringify({ x: 'a', y: null }))
    expect(loadPreviewOffset('user-nan')).toEqual({ x: 0, y: 0 })
  })
})