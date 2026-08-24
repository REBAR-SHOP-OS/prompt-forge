import { describe, expect, it } from 'vitest'
import {
  clampOffset,
  computeSafeRect,
  loadPreviewOffset,
  previewOffsetStorageKey,
  savePreviewOffset,
  ZERO_OFFSET,
  type Rect,
} from './previewPosition'

const frame: Rect = { left: 400, top: 200, right: 600, bottom: 500 }
const workspace: Rect = { left: 0, top: 0, right: 1000, bottom: 800 }

describe('clampOffset', () => {
  it('keeps an in-bounds offset unchanged', () => {
    const safe = computeSafeRect(workspace, null, null, null)
    expect(clampOffset({ x: 50, y: 30 }, frame, safe)).toEqual({ x: 50, y: 30 })
  })

  it('clamps an offset that would push the frame past the right edge', () => {
    const safe = computeSafeRect(workspace, null, null, null)
    // maxX = 1000 - 600 = 400
    expect(clampOffset({ x: 999, y: 0 }, frame, safe).x).toBe(400)
  })

  it('clamps an offset that would push the frame past the left edge', () => {
    const safe = computeSafeRect(workspace, null, null, null)
    // minX = 0 - 400 = -400
    expect(clampOffset({ x: -999, y: 0 }, frame, safe).x).toBe(-400)
  })

  it('clamps vertically against the composer top', () => {
    const composer: Rect = { left: 0, top: 700, right: 1000, bottom: 800 }
    const safe = computeSafeRect(workspace, null, null, composer)
    // maxY = 700 - 500 = 200
    expect(clampOffset({ x: 0, y: 999 }, frame, safe).y).toBe(200)
  })

  it('forces offset to 0 when the safe area is narrower than the frame', () => {
    const narrow: Rect = { left: 0, top: 0, right: 500, bottom: 800 }
    const safe = computeSafeRect(narrow, null, null, null)
    // frame is 200 wide, safe is 500 wide -> movable; use a truly narrow safe
    const tiny: Rect = { left: 0, top: 0, right: 150, bottom: 800 }
    const safeTiny = computeSafeRect(tiny, null, null, null)
    expect(clampOffset({ x: 10, y: 10 }, frame, safeTiny)).toEqual({ x: 0, y: 10 })
  })
})

describe('computeSafeRect', () => {
  it('shrinks the right edge to the right sidebar', () => {
    const right: Rect = { left: 800, top: 0, right: 1000, bottom: 800 }
    const safe = computeSafeRect(workspace, right, null, null)
    expect(safe.right).toBe(800)
  })

  it('shrinks the left edge to the left sidebar', () => {
    const left: Rect = { left: 0, top: 0, right: 200, bottom: 800 }
    const safe = computeSafeRect(workspace, null, left, null)
    expect(safe.left).toBe(200)
  })

  it('shrinks the bottom edge to the composer', () => {
    const composer: Rect = { left: 0, top: 700, right: 1000, bottom: 800 }
    const safe = computeSafeRect(workspace, null, null, composer)
    expect(safe.bottom).toBe(700)
  })

  it('ignores absent overlays', () => {
    const safe = computeSafeRect(workspace, null, null, null)
    expect(safe).toEqual(workspace)
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

  it('returns zero offset when nothing is stored', () => {
    expect(loadPreviewOffset('user-none')).toEqual(ZERO_OFFSET)
  })

  it('returns zero offset for a null user', () => {
    expect(loadPreviewOffset(null)).toEqual(ZERO_OFFSET)
  })

  it('ignores malformed stored JSON', () => {
    window.localStorage.setItem(previewOffsetStorageKey('user-bad'), '{not json')
    expect(loadPreviewOffset('user-bad')).toEqual(ZERO_OFFSET)
  })

  it('sanitizes non-numeric stored values', () => {
    window.localStorage.setItem(previewOffsetStorageKey('user-nan'), JSON.stringify({ x: 'a', y: null }))
    expect(loadPreviewOffset('user-nan')).toEqual(ZERO_OFFSET)
  })
})
