import { describe, expect, it } from 'vitest'
import dashboardSource from '../pages/DashboardPage.tsx?raw'
import {
  getNextPreviewSize,
  PREVIEW_VIDEO_HEIGHT_CSS_VAR,
  PREVIEW_VIDEO_WIDTH_CSS_VAR,
  syncPreviewSizeCssVars,
} from './previewSize'

describe('preview video size lifecycle', () => {
  it('reuses the existing value when rounded dimensions do not change', () => {
    const current = getNextPreviewSize({ w: 0, h: 0 }, 640.2, 359.8)

    expect(current).toEqual({ w: 640, h: 360 })
    expect(getNextPreviewSize(current, 640.4, 360.1)).toBe(current)
  })

  it('normalizes invalid dimensions without producing repeated changes', () => {
    const current = { w: 0, h: 0 }

    expect(getNextPreviewSize(current, Number.NaN, -20)).toBe(current)
  })

  it('writes CSS measurements once and ignores repeated same-size notifications', () => {
    const values = new Map<string, string>()
    const writes: Array<[string, string]> = []
    const style = {
      getPropertyValue: (name: string) => values.get(name) ?? '',
      setProperty: (name: string, value: string) => {
        values.set(name, value)
        writes.push([name, value])
      },
    }

    const first = syncPreviewSizeCssVars(style, { w: 0, h: 0 }, 640.2, 359.8)
    const second = syncPreviewSizeCssVars(style, first, 640.4, 360.1)

    expect(second).toBe(first)
    expect(writes).toEqual([
      [PREVIEW_VIDEO_WIDTH_CSS_VAR, '640px'],
      [PREVIEW_VIDEO_HEIGHT_CSS_VAR, '360px'],
    ])
  })

  it('keeps React state updates out of the entire preview measurement lifecycle', () => {
    const lifecycleStart = dashboardSource.indexOf('const applyPreviewVideoSize = useCallback')
    const start = dashboardSource.indexOf('const setContactBoxRef = useCallback')
    const end = dashboardSource.indexOf('\n  const handleContactPointerDown', start)
    const measurementLifecycle = dashboardSource.slice(lifecycleStart, end)
    const callbackRef = dashboardSource.slice(start, end)

    expect(lifecycleStart).toBeGreaterThan(-1)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(dashboardSource).not.toContain('setPreviewVideoSize')
    expect(dashboardSource).not.toContain('[previewVideoSize,')
    expect(measurementLifecycle).not.toMatch(/\bset[A-Z][A-Za-z0-9_]*\s*\(/)
    expect(dashboardSource).toContain('syncPreviewSizeCssVars(')
    expect(callbackRef).not.toContain('setPreviewVideoSize(')
    expect(callbackRef).not.toContain('setContactBoxVersion(')
    expect(callbackRef).toContain('applyPreviewVideoSize(el,')
    expect(callbackRef).toContain('contactRoRef.current?.disconnect()')
    expect(callbackRef).toContain("if (typeof ResizeObserver === 'undefined') return")

    const invalidateOldNode = callbackRef.indexOf('contactBoxRef.current = el')
    const disconnectObserver = callbackRef.indexOf('contactRoRef.current?.disconnect()')
    expect(invalidateOldNode).toBeGreaterThan(-1)
    expect(disconnectObserver).toBeGreaterThan(invalidateOldNode)
  })
})
