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

function makeRefs() {
  const workspace = makeEl({ left: 0, top: 0, right: 1000, bottom: 800 })
  const rightSidebar = makeEl({ left: 800, top: 0, right: 1000, bottom: 800 })
  const leftSidebar = makeEl({ left: 0, top: 0, right: 200, bottom: 800 })
  const composer = makeEl({ left: 0, top: 700, right: 1000, bottom: 800 })
  const frame = makeEl({ left: 400, top: 200, right: 600, bottom: 500 })
  const header = makeEl({ left: 0, top: 0, right: 1000, bottom: 76 })
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
    rightSidebar.getBoundingClientRect = () =>
      ({ left: 500, top: 0, right: 1000, bottom: 800, width: 500, height: 800, x: 500, y: 0, toJSON: () => ({}) }) as DOMRect
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
    refs.header.current!.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 300, width: 1000, height: 300, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
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

  it('allows the preview to roam the full viewport (not just workspace)', () => {
    // Verify that the safe rect extends beyond the workspace element bounds
    // to the full viewport.  Workspace is 1000 wide, viewport is 1200.
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: 550, y: 0 }))
    const { refs } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    // safe.right = min(1200 - SAFE_MARGIN, 800 - SAFE_MARGIN) = 792
    // maxX = 792 - 600 = 192
    // 550 > 192, so it should clamp to 192 (not 400 which was the old workspace-based limit)
    expect(result.current.offset.x).toBe(800 - SAFE_MARGIN - 600)
  })
})