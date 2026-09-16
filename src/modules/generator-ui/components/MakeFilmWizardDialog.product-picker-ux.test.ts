// Make Full Film keeps its spacious picker, now shared with the Dashboard, and
// its selected state must expose an explicit Change alongside Clear.
import { describe, expect, it } from 'vitest'
import source from './MakeFilmWizardDialog.tsx?raw'

describe('Make Full Film product selection', () => {
  it('uses the shared centered picker', () => {
    expect(source).toContain("import { ChooseProductDialog } from '@/modules/generator-ui/components/ChooseProductDialog'")
    expect(source).toContain('<ChooseProductDialog')
    expect(source).toContain('<ProductPickerCard')
  })

  it('offers Change and Clear on the selected product', () => {
    const selected = source.slice(source.indexOf('{selectedProduct ? ('), source.indexOf('Choose product'))
    expect(selected).toContain('Change')
    expect(selected).toContain('Clear')
    expect(selected).toMatch(/setProductPickerOpen\(true\); void loadProductPhotos\(\)/)
    expect(selected).toMatch(/setSelectedProduct\(null\); setProductName\(''\)/)
    expect(selected).not.toContain('aria-label="Remove product"')
  })

  it('keeps the picker payload semantics unchanged', () => {
    const body = source.slice(source.indexOf('<ChooseProductDialog'), source.indexOf('</ChooseProductDialog>'))
    expect(body).toContain('onSelect={pickProduct}')
    expect(body).toContain('bucket={PRODUCTS_BUCKET}')
  })
})
