import { describe, expect, it } from 'vitest'
import dashboardSource from '../pages/DashboardPage.tsx?raw'
import { getNextPreviewSize } from './previewSize'

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

  it('keeps React state updates out of the callback ref', () => {
    const start = dashboardSource.indexOf('const setContactBoxRef = useCallback')
    const end = dashboardSource.indexOf('\n  }, [applyPreviewVideoSize])', start)
    const callbackRef = dashboardSource.slice(start, end)

    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(callbackRef).not.toContain('setPreviewVideoSize(')
    expect(callbackRef).not.toContain('setContactBoxVersion(')
    expect(callbackRef).not.toContain('applyPreviewVideoSize(0, 0)')
    expect(callbackRef).toContain('contactRoRef.current?.disconnect()')
    expect(callbackRef).toContain('if (!el || typeof ResizeObserver === \'undefined\') return')

    const invalidateOldNode = callbackRef.indexOf('contactBoxRef.current = el')
    const disconnectObserver = callbackRef.indexOf('contactRoRef.current?.disconnect()')
    expect(invalidateOldNode).toBeGreaterThan(-1)
    expect(disconnectObserver).toBeGreaterThan(invalidateOldNode)
  })
})
