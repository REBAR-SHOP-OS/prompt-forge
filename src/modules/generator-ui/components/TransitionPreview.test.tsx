import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransitionPreview } from './TransitionPreview'

let intersectionCallback: IntersectionObserverCallback
let motionMatches = false
let visibility: DocumentVisibilityState = 'visible'
let now = 0
const motionListeners = new Set<EventListener>()
const disconnect = vi.fn()
const observe = vi.fn()
const requestFrame = vi.fn((callback: FrameRequestCallback) => {
  const id = window.setTimeout(() => {
    now += 100
    callback(now)
  }, 16)
  return id
})
const cancelFrame = vi.fn((id: number) => window.clearTimeout(id))

class IntersectionObserverMock {
  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback
  }
  observe = observe
  disconnect = disconnect
  unobserve() {}
  takeRecords() { return [] }
  root = null
  rootMargin = ''
  thresholds = []
}

describe('TransitionPreview animation lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    now = 0
    motionMatches = false
    motionListeners.clear()
    disconnect.mockReset()
    observe.mockReset()
    requestFrame.mockClear()
    cancelFrame.mockClear()
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelFrame)
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    })
    visibility = 'visible'
    window.matchMedia = vi.fn(() => ({
      matches: motionMatches,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') motionListeners.add(listener)
      },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') motionListeners.delete(listener)
      },
      dispatchEvent: vi.fn(),
    }) as MediaQueryList)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('animates through DOM styles, then stops while offscreen or document-hidden', () => {
    render(<TransitionPreview id="crossfade" />)
    expect(observe).toHaveBeenCalledTimes(1)
    expect(requestFrame).toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(96) })
    expect(Number(screen.getByTestId('transition-layer-b').style.opacity)).toBeGreaterThan(0)

    act(() => {
      intersectionCallback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver)
    })
    const scheduledWhenHidden = requestFrame.mock.calls.length
    act(() => { vi.advanceTimersByTime(500) })
    expect(requestFrame).toHaveBeenCalledTimes(scheduledWhenHidden)

    act(() => {
      intersectionCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
      visibility = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const scheduledWhileDocumentHidden = requestFrame.mock.calls.length
    act(() => { vi.advanceTimersByTime(500) })
    expect(requestFrame).toHaveBeenCalledTimes(scheduledWhileDocumentHidden)
  })

  it('honors reduced motion with a static midpoint and no animation frames', () => {
    motionMatches = true
    render(<TransitionPreview id="crossfade" />)

    expect(requestFrame).not.toHaveBeenCalled()
    expect(screen.getByTestId('transition-layer-a')).toHaveStyle({ opacity: '0.5' })
    expect(screen.getByTestId('transition-layer-b')).toHaveStyle({ opacity: '0.5' })
  })

  it('cancels animation and disconnects observation on unmount', () => {
    const { unmount } = render(<TransitionPreview id="wipe" />)
    unmount()

    expect(cancelFrame).toHaveBeenCalled()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})
