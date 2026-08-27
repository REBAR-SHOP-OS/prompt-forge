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

// ---------------------------------------------------------------------------
// New tests: viewport-based safe area vs old workspace-based behaviour
// ---------------------------------------------------------------------------

describe('computeSafeRect: viewport vs workspace base', () => {
  // Scenario: workspace <main> is 1000px wide, but viewport is 1200px.
  // With the OLD workspace-based logic the safe right edge was 1000.
  // With the NEW viewport-based logic it should be 1200 - SAFE_MARGIN.
  const wideViewport: Rect = { left: 0, top: 0, right: 1200, bottom: 800 }
  const oldWorkspace: Rect = { left: 0, top: 0, right: 1000, bottom: 800 }

  it('safe rect extends to viewport width when no overlays block', () => {
    const safe = computeSafeRect(wideViewport, null, null, null)
    expect(safe.right).toBe(1200 - SAFE_MARGIN)
    expect(safe.right).toBeGreaterThan(oldWorkspace.right)
  })

  it('safe rect extends to viewport height when no overlays block', () => {
    const tallViewport: Rect = { left: 0, top: 0, right: 1200, bottom: 900 }
    const safe = computeSafeRect(tallViewport, null, null, null)
    expect(safe.bottom).toBe(900 - SAFE_MARGIN)
  })

  it('frame can move beyond old workspace right edge with no overlays', () => {
    // frame is at [400, 200, 600, 500]; workspace right was 1000.
    // Old maxX = 1000 - 600 = 400.  New maxX = (1200 - 8) - 600 = 592.
    const safe = computeSafeRect(wideViewport, null, null, null)
    // 500 is within new bounds (maxX=592), so it stays unchanged.
    // Under the OLD workspace-based logic maxX was 400, so 500 would have
    // been clamped to 400.
    const clamped = clampOffset({ x: 500, y: 0 }, frame, safe)
    expect(clamped.x).toBe(500)
    expect(clamped.x).toBeGreaterThan(400) // would have been clamped to 400 under old logic
    // Also verify the boundary itself is beyond the old limit
    const clampedFar = clampOffset({ x: 999, y: 0 }, frame, safe)
    expect(clampedFar.x).toBe(1200 - SAFE_MARGIN - 600)
    expect(clampedFar.x).toBeGreaterThan(400)
  })
})

describe('computeSafeRect: overlay exclusion with margin', () => {
  const vp: Rect = { left: 0, top: 0, right: 1200, bottom: 800 }

  it('frame clamped before header zone', () => {
    const header: Rect = { left: 0, top: 0, right: 1200, bottom: 60 }
    const safe = computeSafeRect(vp, null, null, null, header)
    // safe.top = 60 + SAFE_MARGIN = 68
    // minY = 68 - 200 = -132
    const clamped = clampOffset({ x: 0, y: -999 }, frame, safe)
    expect(clamped.y).toBe(60 + SAFE_MARGIN - 200)
    // Verify frame.top + offset never enters header zone
    const frameTopAfter = 200 + clamped.y // 68
    expect(frameTopAfter).toBeGreaterThanOrEqual(60 + SAFE_MARGIN)
  })

  it('frame clamped before right sidebar zone', () => {
    const rightBar: Rect = { left: 900, top: 0, right: 1200, bottom: 800 }
    const safe = computeSafeRect(vp, rightBar, null, null)
    // safe.right = 900 - SAFE_MARGIN = 892
    // maxX = 892 - 600 = 292
    const clamped = clampOffset({ x: 999, y: 0 }, frame, safe)
    expect(clamped.x).toBe(900 - SAFE_MARGIN - 600)
    // Verify frame.right + offset never enters right sidebar zone
    const frameRightAfter = 600 + clamped.x // 892
    expect(frameRightAfter).toBeLessThanOrEqual(900 - SAFE_MARGIN)
  })

  it('frame clamped before left sidebar zone', () => {
    const leftBar: Rect = { left: 0, top: 0, right: 300, bottom: 800 }
    const safe = computeSafeRect(vp, null, leftBar, null)
    // safe.left = 300 + SAFE_MARGIN = 308
    // minX = 308 - 400 = -92
    const clamped = clampOffset({ x: -999, y: 0 }, frame, safe)
    expect(clamped.x).toBe(300 + SAFE_MARGIN - 400)
    // Verify frame.left + offset never enters left sidebar zone
    const frameLeftAfter = 400 + clamped.x // 308
    expect(frameLeftAfter).toBeGreaterThanOrEqual(300 + SAFE_MARGIN)
  })

  it('frame clamped before composer zone', () => {
    const composer: Rect = { left: 0, top: 650, right: 1200, bottom: 800 }
    const safe = computeSafeRect(vp, null, null, composer)
    // safe.bottom = 650 - SAFE_MARGIN = 642
    // maxY = 642 - 500 = 142
    const clamped = clampOffset({ x: 0, y: 999 }, frame, safe)
    expect(clamped.y).toBe(650 - SAFE_MARGIN - 500)
    // Verify frame.bottom + offset never enters composer zone
    const frameBottomAfter = 500 + clamped.y // 642
    expect(frameBottomAfter).toBeLessThanOrEqual(650 - SAFE_MARGIN)
  })

  it('all overlays combined keep frame fully inside safe zone', () => {
    const header: Rect = { left: 0, top: 0, right: 1200, bottom: 60 }
    const rightBar: Rect = { left: 900, top: 0, right: 1200, bottom: 800 }
    const leftBar: Rect = { left: 0, top: 0, right: 300, bottom: 800 }
    const composer: Rect = { left: 0, top: 650, right: 1200, bottom: 800 }
    const safe = computeSafeRect(vp, rightBar, leftBar, composer, header)
    // Try to escape in all four directions
    const clamped = clampOffset({ x: 9999, y: 9999 }, frame, safe)
    expect(clamped.x).toBe(900 - SAFE_MARGIN - 600)
    expect(clamped.y).toBe(650 - SAFE_MARGIN - 500)
    const clampedNeg = clampOffset({ x: -9999, y: -9999 }, frame, safe)
    expect(clampedNeg.x).toBe(300 + SAFE_MARGIN - 400)
    expect(clampedNeg.y).toBe(60 + SAFE_MARGIN - 200)
  })
})

describe('DEFAULT_OFFSET', () => {
  it('has a y value of 40', () => {
    expect(DEFAULT_OFFSET).toEqual({ x: 0, y: 40 })
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

  it('migrates the legacy default offset to the new default', () => {
    window.localStorage.setItem(previewOffsetStorageKey('user-legacy'), JSON.stringify({ x: 0, y: 24 }))
    expect(loadPreviewOffset('user-legacy')).toEqual(DEFAULT_OFFSET)
  })

  it('preserves a custom position that happens to share the legacy x', () => {
    window.localStorage.setItem(previewOffsetStorageKey('user-custom'), JSON.stringify({ x: 0, y: -34 }))
    expect(loadPreviewOffset('user-custom')).toEqual({ x: 0, y: -34 })
  })
})