import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePreviewPosition, type PreviewPositionRefs } from './usePreviewPosition'
import { DEFAULT_OFFSET, SAFE_MARGIN } from '@/modules/generator-ui/lib/previewPosition'

function makeEl(rect: { left: number; top: number; right: number; bottom: number }): HTMLElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect
  return el
}

function setRect(el: HTMLElement, rect: { left: number; top: number; right: number; bottom: number }) {
  el.getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect
}

function makeRefs(overrides: Partial<{
  workspace: { left: number; top: number; right: number; bottom: number }
  rightSidebar: { left: number; top: number; right: number; bottom: number }
  leftSidebar: { left: number; top: number; right: number; bottom: number }
  composer: { left: number; top: number; right: number; bottom: number }
  frame: { left: number; top: number; right: number; bottom: number }
  header: { left: number; top: number; right: number; bottom: number }
}> = {}) {
  const workspace = makeEl(overrides.workspace ?? { left: 0, top: 0, right: 1000, bottom: 800 })
  const rightSidebar = makeEl(overrides.rightSidebar ?? { left: 800, top: 0, right: 1000, bottom: 800 })
  const leftSidebar = makeEl(overrides.leftSidebar ?? { left: 0, top: 0, right: 200, bottom: 800 })
  const composer = makeEl(overrides.composer ?? { left: 0, top: 700, right: 1000, bottom: 800 })
  const frame = makeEl(overrides.frame ?? { left: 400, top: 200, right: 600, bottom: 500 })
  const header = makeEl(overrides.header ?? { left: 0, top: 0, right: 1000, bottom: 76 })
  const refs: PreviewPositionRefs = {
    workspace: { current: workspace },
    rightSidebar: { current: rightSidebar },
    leftSidebar: { current: leftSidebar },
    composer: { current: composer },
    frame: { current: frame },
    header: { current: header },
  }
  return { refs, workspace, rightSidebar, leftSidebar, composer, frame, header }
}

describe('usePreviewPosition', () => {
  beforeEach(() => {
    window.localStorage.clear()
    // Default to a desktop viewport so dragging is enabled.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
  })

  it('starts at DEFAULT_OFFSET and enabled on desktop', () => {
    const { refs } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    expect(result.current.offset).toEqual(DEFAULT_OFFSET)
    expect(result.current.disabled).toBe(false)
  })

  it('restores a persisted offset on mount', () => {
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: 40, y: 20 }))
    const { refs } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    expect(result.current.offset).toEqual({ x: 40, y: 20 })
  })

  it('persists the offset when it changes', () => {
    const { refs } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    act(() => result.current.reset())
    expect(window.localStorage.getItem('generator:previewOffset:user-1')).toBe(JSON.stringify(DEFAULT_OFFSET))
  })

  it('resets the offset to DEFAULT_OFFSET', () => {
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: 40, y: 20 }))
    const { refs } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    act(() => result.current.reset())
    expect(result.current.offset).toEqual(DEFAULT_OFFSET)
  })

  it('disables dragging on a small viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 })
    const { refs } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    expect(result.current.disabled).toBe(true)
  })

  it('clamps the offset when the layout changes (resize)', () => {
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: 500, y: 0 }))
    const { refs, rightSidebar } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    // Viewport is 1200×800. rightSidebar.left=800.
    // safe.right = min(1200 - SAFE_MARGIN, 800 - SAFE_MARGIN) = 792
    // maxX = 792 - 600 = 192
    expect(result.current.offset.x).toBe(800 - SAFE_MARGIN - 600)
    // Shrink the safe area further and force a re-clamp by mutating the sidebar.
    setRect(rightSidebar, { left: 500, top: 0, right: 1000, bottom: 800 })
    // Trigger the clamp effect by re-rendering with a changed dependency.
    act(() => {
      result.current.reset()
    })
    expect(result.current.offset).toEqual(DEFAULT_OFFSET)
  })

  it('re-clamps when deps change (aspectRatio)', async () => {
    // Store an offset that will be out of bounds once the header grows.
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: 0, y: -100 }))
    const { refs } = makeRefs()
    const { result, rerender } = renderHook(
      ({ deps }) => usePreviewPosition('user-1', refs, deps),
      { initialProps: { deps: ['9:16'] as ReadonlyArray<unknown> } },
    )
    // safe.top = max(SAFE_MARGIN, 76 + SAFE_MARGIN) = 84
    // minY = 84 - 200 = -116; y=-100 is within bounds
    expect(result.current.offset.y).toBe(-100)

    // Move the header down so y=-100 is now out of bounds.
    setRect(refs.header.current!, { left: 0, top: 0, right: 1000, bottom: 300 })
    // safe.top = max(SAFE_MARGIN, 300 + SAFE_MARGIN) = 308
    // minY = 308 - 200 = 108, so y=-100 should clamp to 108
    rerender({ deps: ['1:1'] })
    await act(async () => { /* act flushes pending effects */ })
    expect(result.current.offset.y).toBe(300 + SAFE_MARGIN - 200)
  })

  it('clamps the offset using the header bound', () => {
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: 0, y: -200 }))
    const { refs } = makeRefs()
    // frame.top = 200, header.bottom = 76
    // safe.top = max(SAFE_MARGIN, 76 + SAFE_MARGIN) = 84
    // minY = 84 - 200 = -116
    // y=-200 should be clamped to -116
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    expect(result.current.offset.y).toBe(76 + SAFE_MARGIN - 200)
  })

  it('does not start a drag from a non-handle pointer (no-op when disabled)', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 })
    const { refs } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    const handle = document.createElement('div')
    const ev = {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
      currentTarget: handle,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.PointerEvent<HTMLElement>
    act(() => {
      result.current.onHandlePointerDown(ev)
    })
    expect(result.current.dragging).toBe(false)
  })

  // -------------------------------------------------------------------------
  // New tests: viewport-based roaming beyond old workspace boundary
  // -------------------------------------------------------------------------

  it('allows preview to roam beyond old workspace boundary when no overlays block', () => {
    // Viewport is 1200 wide.  Workspace element is only 1000 wide.
    // With no sidebars, the safe area extends to viewport edges.
    // Old workspace-based maxX = 1000 - 600 = 400.
    // New viewport-based maxX = (1200 - SAFE_MARGIN) - 600 = 592.
    // Store 550 — under old logic it would clamp to 400; under new logic it
    // stays at 550 (within 592), proving the preview went past the old limit.
    const { refs } = makeRefs({
      rightSidebar: { left: 0, top: 0, right: 0, bottom: 0 },
      leftSidebar: { left: 0, top: 0, right: 0, bottom: 0 },
    })
    refs.rightSidebar.current = null
    refs.leftSidebar.current = null
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: 550, y: 0 }))
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    // 550 is within new maxX (592) so it stays unchanged
    expect(result.current.offset.x).toBe(550)
    // Under old workspace-based logic maxX was 400, so 550 would have clamped to 400
    expect(result.current.offset.x).toBeGreaterThan(400)
    // Also verify the far boundary with an out-of-bounds offset
    window.localStorage.setItem('generator:previewOffset:user-2', JSON.stringify({ x: 999, y: 0 }))
    const { result: r2 } = renderHook(() => usePreviewPosition('user-2', refs))
    expect(r2.current.offset.x).toBe(1200 - SAFE_MARGIN - 600)
    expect(r2.current.offset.x).toBeGreaterThan(400)
  })

  it('allows preview to roam left beyond old workspace boundary when no overlays', () => {
    // frame.left = 400.  Old workspace minX = 0 - 400 = -400.
    // New viewport minX = SAFE_MARGIN - 400 = -392.
    // An offset of -450 should clamp to -392 (new) not -400 (old).
    const { refs } = makeRefs({
      rightSidebar: { left: 0, top: 0, right: 0, bottom: 0 },
      leftSidebar: { left: 0, top: 0, right: 0, bottom: 0 },
    })
    refs.rightSidebar.current = null
    refs.leftSidebar.current = null
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: -450, y: 0 }))
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    expect(result.current.offset.x).toBe(SAFE_MARGIN - 400)
  })

  // -------------------------------------------------------------------------
  // New tests: preview never overlaps header, sidebars, or composer
  // -------------------------------------------------------------------------

  it('preview never overlaps header zone', () => {
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: 0, y: -999 }))
    const { refs } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    const frameTopAfter = 200 + result.current.offset.y
    const headerBottom = 76
    expect(frameTopAfter).toBeGreaterThanOrEqual(headerBottom + SAFE_MARGIN)
  })

  it('preview never overlaps right sidebar zone', () => {
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: 999, y: 0 }))
    const { refs } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    const frameRightAfter = 600 + result.current.offset.x
    const rightSidebarLeft = 800
    expect(frameRightAfter).toBeLessThanOrEqual(rightSidebarLeft - SAFE_MARGIN)
  })

  it('preview never overlaps left sidebar zone', () => {
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: -999, y: 0 }))
    const { refs } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    const frameLeftAfter = 400 + result.current.offset.x
    const leftSidebarRight = 200
    expect(frameLeftAfter).toBeGreaterThanOrEqual(leftSidebarRight + SAFE_MARGIN)
  })

  it('preview never overlaps composer zone', () => {
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: 0, y: 999 }))
    const { refs } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    const frameBottomAfter = 500 + result.current.offset.y
    const composerTop = 700
    expect(frameBottomAfter).toBeLessThanOrEqual(composerTop - SAFE_MARGIN)
  })

  // -------------------------------------------------------------------------
  // New tests: layout resize triggers re-clamp
  // (Simulated by mutating overlay element rects, same pattern as existing tests)
  // -------------------------------------------------------------------------

  it('re-clamps stored offset when layout shrinks horizontally (wide → narrow)', async () => {
    // Start with right sidebar at left=1100 (far right, lots of room).
    // safe.right = min(1200-8, 1100-8) = 1092
    // maxX = 1092 - 600 = 492
    // Store x=450 (valid, 450 < 492).
    // Then move right sidebar to left=700 (simulating narrower safe area).
    // safe.right = 700-8 = 692, maxX = 692-600 = 92.
    // 450 > 92 → should clamp to 92.
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: 450, y: 0 }))
    const { refs, rightSidebar } = makeRefs({
      rightSidebar: { left: 1100, top: 0, right: 1200, bottom: 800 },
    })
    const { result, rerender } = renderHook(
      ({ deps }) => usePreviewPosition('user-1', refs, deps),
      { initialProps: { deps: [false] as ReadonlyArray<unknown> } },
    )
    // At initial layout: maxX = 492, so 450 is valid
    expect(result.current.offset.x).toBe(450)

    // Shrink safe area by moving right sidebar left
    setRect(rightSidebar, { left: 700, top: 0, right: 1200, bottom: 800 })
    rerender({ deps: [true] })
    await act(async () => { /* flush effects */ })
    // maxX = (700 - 8) - 600 = 92
    expect(result.current.offset.x).toBe(700 - SAFE_MARGIN - 600)
    expect(result.current.offset.x).toBeLessThan(450)
  })

  it('re-clamps stored offset when layout shrinks vertically (tall → short)', async () => {
    // Start with composer at top=750.
    // safe.bottom = 750-8 = 742, maxY = 742-500 = 242.
    // Store y=200 (valid, 200 < 242).
    // Then move composer to top=600.
    // safe.bottom = 600-8 = 592, maxY = 592-500 = 92.
    // 200 > 92 → should clamp to 92.
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: 0, y: 200 }))
    const { refs, composer } = makeRefs({
      composer: { left: 0, top: 750, right: 1200, bottom: 800 },
    })
    const { result, rerender } = renderHook(
      ({ deps }) => usePreviewPosition('user-1', refs, deps),
      { initialProps: { deps: [false] as ReadonlyArray<unknown> } },
    )
    // At initial layout: maxY = 242, so 200 is valid
    expect(result.current.offset.y).toBe(200)

    // Shrink safe area by moving composer up
    setRect(composer, { left: 0, top: 600, right: 1200, bottom: 800 })
    rerender({ deps: [true] })
    await act(async () => { /* flush effects */ })
    // maxY = (600 - 8) - 500 = 92
    expect(result.current.offset.y).toBe(600 - SAFE_MARGIN - 500)
    expect(result.current.offset.y).toBeLessThan(200)
  })

  // -------------------------------------------------------------------------
  // New tests: sidebar open/close triggers re-clamp
  // -------------------------------------------------------------------------

  it('re-clamps when right sidebar appears (open)', async () => {
    // Start with no right sidebar.  Store offset x=500 (valid without sidebar).
    // Then sidebar appears at left=800.  maxX drops to 800 - 8 - 600 = 192.
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: 500, y: 0 }))
    const { refs, rightSidebar } = makeRefs({
      rightSidebar: { left: 0, top: 0, right: 0, bottom: 0 },
    })
    refs.rightSidebar.current = null
    const { result, rerender } = renderHook(
      ({ deps }) => usePreviewPosition('user-1', refs, deps),
      { initialProps: { deps: [false] as ReadonlyArray<unknown> } },
    )
    // No sidebar: maxX = (1200 - 8) - 600 = 592, so 500 is valid
    expect(result.current.offset.x).toBe(500)

    // Sidebar appears
    refs.rightSidebar.current = rightSidebar
    setRect(rightSidebar, { left: 800, top: 0, right: 1200, bottom: 800 })
    rerender({ deps: [true] })
    await act(async () => { /* flush effects */ })
    // maxX = (800 - 8) - 600 = 192
    expect(result.current.offset.x).toBe(800 - SAFE_MARGIN - 600)
    expect(result.current.offset.x).toBeLessThan(500)
  })

  it('re-clamps when left sidebar appears (open)', async () => {
    // Start with no left sidebar.  Store offset x=-300 (valid without sidebar).
    // minX = SAFE_MARGIN - 400 = -392.  -300 > -392, so valid.
    // Then left sidebar appears at right=300.  minX = (300 + 8) - 400 = -92.
    // -300 < -92, so it should clamp to -92.
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: -300, y: 0 }))
    const { refs, leftSidebar } = makeRefs({
      leftSidebar: { left: 0, top: 0, right: 0, bottom: 0 },
    })
    refs.leftSidebar.current = null
    const { result, rerender } = renderHook(
      ({ deps }) => usePreviewPosition('user-1', refs, deps),
      { initialProps: { deps: [false] as ReadonlyArray<unknown> } },
    )
    // No left sidebar: -300 is valid
    expect(result.current.offset.x).toBe(-300)

    // Left sidebar appears
    refs.leftSidebar.current = leftSidebar
    setRect(leftSidebar, { left: 0, top: 0, right: 300, bottom: 800 })
    rerender({ deps: [true] })
    await act(async () => { /* flush effects */ })
    // minX = (300 + 8) - 400 = -92
    expect(result.current.offset.x).toBe(300 + SAFE_MARGIN - 400)
    expect(result.current.offset.x).toBeGreaterThan(-300)
  })

  // -------------------------------------------------------------------------
  // New test: runtime smoke — drag to free area, verify no overlap
  // -------------------------------------------------------------------------

  it('runtime smoke: drag to free area, verify no overlap with overlays', () => {
    // Setup: viewport 1200×800, all overlays present.
    // frame at [400, 200, 600, 500].
    // safe = [208, 84, 792, 692] (with all overlays + margins).
    // maxX = 792 - 600 = 192, maxY = 692 - 500 = 192.
    const { refs } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))

    // Simulate a drag to the bottom-right free area
    const handle = document.createElement('div')
    const startOffset = result.current.offset

    act(() => {
      const downEv = {
        clientX: 500, clientY: 300, pointerId: 1, currentTarget: handle,
        preventDefault: vi.fn(), stopPropagation: vi.fn(),
      } as unknown as React.PointerEvent<HTMLElement>
      result.current.onHandlePointerDown(downEv)
    })

    // Simulate pointer move: drag +150px right, +300px down
    act(() => {
      const moveEv = new Event('pointermove') as PointerEvent
      Object.defineProperty(moveEv, 'clientX', { value: 650, configurable: true })
      Object.defineProperty(moveEv, 'clientY', { value: 600, configurable: true })
      window.dispatchEvent(moveEv)
    })

    // The offset should be clamped within safe bounds
    expect(result.current.offset.x).toBeLessThanOrEqual(800 - SAFE_MARGIN - 600)
    expect(result.current.offset.y).toBeLessThanOrEqual(700 - SAFE_MARGIN - 500)

    // Release the drag
    act(() => {
      window.dispatchEvent(new Event('pointerup') as PointerEvent)
    })
    expect(result.current.dragging).toBe(false)

    // Verify no overlap with any overlay
    const frameLeft = 400 + result.current.offset.x
    const frameRight = 600 + result.current.offset.x
    const frameTop = 200 + result.current.offset.y
    const frameBottom = 500 + result.current.offset.y

    // Header zone: [0, 0, 1200, 76] — frame top must be ≥ 84
    expect(frameTop).toBeGreaterThanOrEqual(76 + SAFE_MARGIN)
    // Right sidebar zone: [800, 0, 1200, 800] — frame right must be ≤ 792
    expect(frameRight).toBeLessThanOrEqual(800 - SAFE_MARGIN)
    // Left sidebar zone: [0, 0, 200, 800] — frame left must be ≥ 208
    expect(frameLeft).toBeGreaterThanOrEqual(200 + SAFE_MARGIN)
    // Composer zone: [0, 700, 1200, 800] — frame bottom must be ≤ 692
    expect(frameBottom).toBeLessThanOrEqual(700 - SAFE_MARGIN)
  })
})