import { describe, expect, it } from 'vitest'
import source from './DashboardPage.tsx?raw'

const characterMenuStart = source.indexOf('<Popover\n              open={characterMenuOpen}')
const productMenuStart = source.indexOf('<Popover\n              open={productMenuOpen}', characterMenuStart)

expect(characterMenuStart, 'character popover marker not found').toBeGreaterThan(-1)
expect(productMenuStart, 'product popover marker not found').toBeGreaterThan(characterMenuStart)

const characterMenu = source.slice(characterMenuStart, productMenuStart)

describe('DashboardPage unified character control', () => {
  it('renders one composer entry point for character workflows', () => {
    expect(source).not.toContain('aria-label="Create a film built around an uploaded character"')
    expect(characterMenu.match(/<PopoverTrigger asChild>/g)).toHaveLength(1)
    expect(characterMenu).toContain('aria-label="Manage project character"')
    expect(characterMenu).toContain('<span>Character</span>')
    expect(characterMenu).not.toContain('<span>Add character</span>')
  })

  it('keeps existing-character selection behind the unified control', () => {
    expect(characterMenu).toContain('if (open) void loadCharacterList()')
    expect(characterMenu).toContain('{characterList.map((c) => (')
    expect(characterMenu).toContain('setSelectedCharacter(c)')
    expect(characterMenu).toContain('updateContinuity({ characterRef: c })')
  })

  it('opens Character Sheet creation from inside the same menu', () => {
    expect(characterMenu).toContain('<span>Create or upload character</span>')
    expect(characterMenu).toMatch(
      /setCharacterMenuOpen\(false\)[\s\S]*setIsCharacterSheetOpen\(true\)/,
    )
    expect(source.match(/setIsCharacterSheetOpen\(true\)/g)).toHaveLength(1)
  })
})
