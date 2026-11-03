import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Rule: one dashboard for all users — the product/character catalog is shared
// company-wide, while edits stay owner-only.
const read = (p: string) => readFileSync(p, 'utf8')

describe('shared product catalog', () => {
  it('product loader in the dashboard is not limited to the signed-in user', () => {
    const src = read('src/modules/generator-ui/pages/DashboardPage.tsx')
    const loader = src.slice(src.indexOf('const loadProductImages'), src.indexOf('const loadArchive'))
    expect(loader).not.toContain(".eq('user_id', userId)")
    expect(loader).toContain('sharedItemIdsRef.current.add(product.id)')
  })

  it('film wizard product picker is not limited to the signed-in user', () => {
    const src = read('src/modules/generator-ui/components/MakeFilmWizardDialog.tsx')
    const loader = src.slice(src.indexOf('async function loadProductPhotos'), src.indexOf('async function loadCharacterPhotos'))
    expect(loader).not.toContain(".eq('user_id', userId)")
  })
})
