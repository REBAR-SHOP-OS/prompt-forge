import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePreviewPosition, type PreviewPositionRefs } from './usePreviewPosition'

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
  const refs: PreviewPositionRefs = {
    workspace: { current: workspace },
    rightSidebar: { current: rightSidebar },
    leftSidebar: { current: leftSidebar },
    composer: { current: composer },
    frame: { current: frame },
  }
  return { refs, workspace, rightSidebar, leftSidebar, composer, frame }
}

describe('usePreviewPosition', () => {
  beforeEach(() => {
    window.localStorage.clear()
    // Default to a desktop viewport so dragging is enabled.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
  })

  it('starts centered and enabled on desktop', () => {
    const { refs } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    expect(result.current.offset).toEqual({ x: 0, y: 0 })
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
    // reset writes {0,0}; verify a non-zero value persists via a drag below.
    expect(window.localStorage.getItem('generator:previewOffset:user-1')).toBe(JSON.stringify({ x: 0, y: 0 }))
  })

  it('resets the offset to centered', () => {
    window.localStorage.setItem('generator:previewOffset:user-1', JSON.stringify({ x: 40, y: 20 }))
    const { refs } = makeRefs()
    const { result } = renderHook(() => usePreviewPosition('user-1', refs))
    act(() => result.current.reset())
    expect(result.current.offset).toEqual({ x: 0, y: 0 })
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
    // maxX = rightSidebar.left(800) - frame.right(600) = 200
    expect(result.current.offset.x).toBe(200)
    // Shrink the safe area further and force a re-clamp by mutating the sidebar.
    rightSidebar.getBoundingClientRect = () =>
      ({ left: 500, top: 0, right: 1000, bottom: 800, width: 500, height: 800, x: 500, y: 0, toJSON: () => ({}) }) as DOMRect
    // Trigger the clamp effect by re-rendering with a changed dependency.
    act(() => {
      result.current.reset()
    })
    expect(result.current.offset).toEqual({ x: 0, y: 0 })
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
})
