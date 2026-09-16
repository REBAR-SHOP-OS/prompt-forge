// The Dashboard composer's product control used to open a cramped popover that
// rendered the saved-product grid inline. It now opens the same spacious,
// centered picker as Make Full Film's "Choose product", and the selected state
// exposes explicit Change / Clear actions. Source assertions match the existing
// DashboardPage test style (the page is too large to mount here).
import { describe, expect, it } from 'vitest'
import source from './DashboardPage.tsx?raw'
import picker from '../components/ChooseProductDialog.tsx?raw'

describe('Dashboard saved-product picker', () => {
  it('opens the shared centered picker from Add product', () => {
    expect(source).toContain("import { ChooseProductDialog } from '@/modules/generator-ui/components/ChooseProductDialog'")
    expect(source).toContain('<span>Add product</span>')
    expect(source).toMatch(/onClick=\{\(\) => \{ setProductMenuOpen\(true\); void loadProductImages\(\) \}\}/)
    expect(source).toContain('<ChooseProductDialog')
  })

  it('offers explicit Change and Clear on the selected product', () => {
    expect(source).toContain('>\n                  Change\n                </button>')
    expect(source).toContain('>\n                  Clear\n                </button>')
    expect(source).toContain('onClick={() => clearProductFromCurrentProject()}')
  })

  it('keeps the saved-product grid only inside the picker', () => {
    const dialogStart = source.indexOf('<ChooseProductDialog')
    const dialogEnd = source.indexOf('</ChooseProductDialog>')
    expect(dialogStart).toBeGreaterThan(0)
    const body = source.slice(dialogStart, dialogEnd)
    expect(body).toContain('visibleArchiveProductGroups.map((group) =>')
    // The grid must not remain anywhere else in the composer UI.
    expect(source.split('visibleArchiveProductGroups.map((group) =>').length - 1).toBe(1)
    // The old cramped popover path is gone.
    expect(source).not.toContain('Project product')
  })

  it('replaces the single selection and closes the picker on select', () => {
    const body = source.slice(source.indexOf('<ChooseProductDialog'), source.indexOf('</ChooseProductDialog>'))
    expect(body).toMatch(/assignProductToCurrentProject\(product\)\s*\n\s*setProductMenuOpen\(false\)/)
    // Selection semantics unchanged: same product shape reaches the project.
    expect(body).toContain('category: productIdentityCategory(group)')
    expect(body).toContain('urls,')
  })

  it('shares one consistent title and saved-angle description', () => {
    expect(picker).toContain("export const CHOOSE_PRODUCT_TITLE = 'Choose a product'")
    expect(picker).toContain('Select a product folder. Its saved angles will rotate across the film scenes.')
  })
})
