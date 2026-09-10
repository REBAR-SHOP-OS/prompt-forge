import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ProductPhotoGroup } from './productPhotoGroups'
import {
  activeProjectProductIdentity,
  approvedProductViewUrls,
  filterProductIdentityGroups,
  normalizeProductIdentity,
  productViewsForScene,
  refreshProductIdentity,
  persistProjectProductIdentity,
  mergeRestoredProductIdentities,
} from './productIdentity'

type Photo = { id: string; title: string; storagePath: string }

const dashboardSource = readFileSync(
  path.resolve(process.cwd(), 'src/modules/generator-ui/pages/DashboardPage.tsx'),
  'utf8',
)
const wizardSource = readFileSync(
  path.resolve(process.cwd(), 'src/modules/generator-ui/components/MakeFilmWizardDialog.tsx'),
  'utf8',
)

const groups: ProductPhotoGroup<Photo>[] = [
  {
    id: 'folder:stirrups',
    name: 'Stirrups',
    photos: [
      { id: 'front', title: 'Stirrups', storagePath: 'front.png' },
      { id: 'side', title: 'Stirrups', storagePath: 'side.png' },
    ],
  },
  {
    id: 'legacy-mesh',
    name: 'Legacy Mesh',
    photos: [{ id: 'legacy', title: 'Legacy Mesh', storagePath: 'legacy.png' }],
  },
]

describe('product identity categories and views', () => {
  it('renders compact grouped approved views', () => {
    expect(filterProductIdentityGroups(groups, 'products')).toEqual([groups[0]])
    expect(filterProductIdentityGroups(groups, 'legacy')).toEqual([groups[1]])
    expect(approvedProductViewUrls('front.png', ['front.png', '', 'side.png', 'side.png'])).toEqual([
      'front.png',
      'side.png',
    ])
    expect(wizardSource).toContain('aria-label="Product categories"')
    expect(wizardSource).toContain('visibleProductGroups.map((group)')
    expect(wizardSource).toContain('urls: signedAngles.map((angle) => angle.url)')
    expect(dashboardSource).toContain('visibleArchiveProductGroups.map((group)')
    expect(dashboardSource).toContain('group.photos.map((photo) => photo.storage_path)')
  })

  it('propagates the active project product identity to film generation', () => {
    const stirrups = normalizeProductIdentity({
      id: 'folder:stirrups',
      name: 'Stirrups',
      category: 'products',
      url: 'front.png',
      urls: ['front.png', 'side.png', 'back.png', 'detail.png'],
    })
    const mesh = normalizeProductIdentity({
      id: 'folder:mesh',
      name: 'Mesh',
      category: 'products',
      url: 'mesh.png',
    })
    const identities = { 'draft-a': stirrups, 'draft-b': mesh }

    expect(activeProjectProductIdentity(identities, 'draft-a')).toEqual(stirrups)
    expect(activeProjectProductIdentity(identities, 'draft-b')).toEqual(mesh)
    expect(activeProjectProductIdentity(identities, 'draft-missing')).toBeNull()
    expect(productViewsForScene(stirrups, 0, 3)).toEqual(['front.png', 'side.png', 'back.png'])
    expect(productViewsForScene(stirrups, 1, 3)).toEqual(['side.png', 'back.png', 'detail.png'])
    expect(dashboardSource).toContain('activeProjectProductIdentity(projectProductIdentities, productIdentityScopeId)')
    expect(dashboardSource).toContain('const sceneProductUrls = productViewsForScene(activeProduct, i)')
    expect(dashboardSource).toContain('referenceImageUrls,')
    expect(dashboardSource).toContain("id: options.identity.productId ?? 'wizard-product'")
    expect(dashboardSource).toContain('options.identity.productUrls')
  })

  it('falls back for sparse and legacy product data', () => {
    const legacy = normalizeProductIdentity({
      id: 'legacy-mesh',
      name: 'Legacy Mesh',
      category: 'legacy',
      url: 'legacy.png',
      urls: [],
    })

    expect(legacy.urls).toEqual(['legacy.png'])
    expect(productViewsForScene(legacy, 9)).toEqual(['legacy.png'])
    expect(productViewsForScene(null, 0)).toEqual([])
  })
})

describe('restoring product identity', () => {
  const product = normalizeProductIdentity({ id: 'folder:p', category: 'products', url: 'expired-front', urls: ['expired-front', 'expired-side'] })
  it('replaces expired references with freshly signed URLs', async () => {
    const restored = await refreshProductIdentity(product, async (url) => `fresh-${url}`)
    expect(restored?.urls).toEqual(['fresh-expired-front', 'fresh-expired-side'])
    expect(restored?.url).toBe('fresh-expired-front')
    expect(product.url).toBe('expired-front')
  })
  it('keeps a usable angle when another angle is unavailable', async () => {
    const restored = await refreshProductIdentity(product, async (url) => {
      if (url === 'expired-front') throw new Error('deleted')
      return 'fresh-side'
    })
    expect(restored?.urls).toEqual(['fresh-side'])
    expect(restored?.url).toBe('fresh-side')
  })
  it('does not restore an identity with no accessible references', async () => {
    expect(await refreshProductIdentity(product, async () => null)).toBeNull()
  })
})

describe('selection changes while a draft is restoring', () => {
  const oldProduct = normalizeProductIdentity({ id: 'folder:old', category: 'products', url: 'expired' })
  const newProduct = normalizeProductIdentity({ id: 'folder:new', category: 'products', url: 'new' })
  it('preserves other draft identities after deferred signing, selection, and reload', async () => {
    const key = 'product-identities-race'
    localStorage.setItem(key, JSON.stringify({ olderDraft: oldProduct }))
    let finish: (url: string) => void
    const restoring = refreshProductIdentity(oldProduct, () => new Promise<string>((resolve) => { finish = resolve }))
    persistProjectProductIdentity(localStorage, key, 'newDraft', newProduct)
    finish('fresh-old')
    const restored = await restoring
    const state = mergeRestoredProductIdentities({ olderDraft: restored }, { newDraft: newProduct }, new Set(['newDraft']))
    expect(Object.keys(state).sort()).toEqual(['newDraft', 'olderDraft'])
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ olderDraft: oldProduct, newDraft: newProduct })
  })
  it('does not resurrect a removed identity when signing finishes later', async () => {
    const key = 'product-identities-remove-race'
    localStorage.setItem(key, JSON.stringify({ draft: oldProduct, other: newProduct }))
    let finish: (url: string) => void
    const restoring = refreshProductIdentity(oldProduct, () => new Promise<string>((resolve) => { finish = resolve }))
    persistProjectProductIdentity(localStorage, key, 'draft', null)
    finish('fresh-old')
    const restored = await restoring
    expect(mergeRestoredProductIdentities({ draft: restored }, {}, new Set(['draft']))).toEqual({})
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ other: newProduct })
  })
})
