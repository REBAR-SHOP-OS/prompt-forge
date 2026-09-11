import { describe, expect, it } from 'vitest'
import { selectActiveContactOverlay } from './contactOverlaySelection'

describe('selectActiveContactOverlay', () => {
  it('renders only the logo when contact text is disabled', () => {
    expect(selectActiveContactOverlay({
      textEnabled: false,
      lines: ['rebar.shop', '+1 555 0100', 'Toronto'],
      logoEnabled: true,
      logoUrl: 'data:image/png;base64,logo',
      panelEnabled: true,
    })).toEqual({
      active: true,
      lines: [],
      logoUrl: 'data:image/png;base64,logo',
      panelEnabled: false,
    })
  })

  it('keeps contact text and its panel independently enabled', () => {
    expect(selectActiveContactOverlay({
      textEnabled: true,
      lines: [' rebar.shop ', '', ' Toronto '],
      logoEnabled: false,
      logoUrl: 'data:image/png;base64,logo',
      panelEnabled: true,
    })).toEqual({
      active: true,
      lines: ['rebar.shop', 'Toronto'],
      logoUrl: undefined,
      panelEnabled: true,
    })
  })

  it('disables the overlay when both text and logo are hidden', () => {
    expect(selectActiveContactOverlay({
      textEnabled: false,
      lines: ['rebar.shop'],
      logoEnabled: false,
      logoUrl: 'data:image/png;base64,logo',
      panelEnabled: true,
    })).toEqual({
      active: false,
      lines: [],
      logoUrl: undefined,
      panelEnabled: false,
    })
  })
})
