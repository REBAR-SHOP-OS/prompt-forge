import type { ProductPhotoGroup, ProductPhotoGroupItem } from './productPhotoGroups'

export type ProductIdentityCategoryId = 'products' | 'legacy'

export interface ProductIdentityCategory {
  id: ProductIdentityCategoryId
  label: string
}

export interface ProductIdentitySelection {
  id: string
  name?: string
  title?: string | null
  category: ProductIdentityCategoryId
  url: string
  urls: string[]
  description?: string | null
}

export const PRODUCT_IDENTITY_CATEGORIES: readonly ProductIdentityCategory[] = [
  { id: 'products', label: 'Products' },
  { id: 'legacy', label: 'Legacy' },
]

export function productIdentityCategory<T extends ProductPhotoGroupItem>(
  group: ProductPhotoGroup<T>,
): ProductIdentityCategoryId {
  return group.id.startsWith('folder:') ? 'products' : 'legacy'
}

export function filterProductIdentityGroups<T extends ProductPhotoGroupItem>(
  groups: readonly ProductPhotoGroup<T>[],
  category: ProductIdentityCategoryId,
): ProductPhotoGroup<T>[] {
  return groups.filter((group) => productIdentityCategory(group) === category)
}

/**
 * Keep only usable, unique references. Product rows are already scoped to
 * category=product and deleted_at IS NULL by their loaders; failed signed URLs
 * are omitted before this function is called.
 */
export function approvedProductViewUrls(primaryUrl: string | null | undefined, urls?: readonly string[]): string[] {
  const seen = new Set<string>()
  const approved: string[] = []
  for (const value of [primaryUrl, ...(urls ?? [])]) {
    const url = value?.trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    approved.push(url)
  }
  return approved
}

export function normalizeProductIdentity(
  identity: Omit<ProductIdentitySelection, 'urls'> & { urls?: readonly string[] },
): ProductIdentitySelection {
  const urls = approvedProductViewUrls(identity.url, identity.urls)
  return {
    ...identity,
    url: urls[0] ?? identity.url,
    urls: urls.length > 0 ? urls : [identity.url],
  }
}

/** Rotate the bounded provider window so every approved view contributes across scenes. */
export function productViewsForScene(
  identity: ProductIdentitySelection | null | undefined,
  sceneIndex: number,
  maxViews = 3,
): string[] {
  if (!identity || maxViews <= 0) return []
  const urls = approvedProductViewUrls(identity.url, identity.urls)
  if (urls.length <= 1) return urls
  const start = Math.max(0, Math.trunc(sceneIndex)) % urls.length
  const count = Math.min(Math.max(1, Math.trunc(maxViews)), urls.length)
  return Array.from({ length: count }, (_, offset) => urls[(start + offset) % urls.length])
}

export function activeProjectProductIdentity<T extends ProductIdentitySelection>(
  identities: Readonly<Record<string, T>>,
  projectId: string | null | undefined,
): T | null {
  if (!projectId) return null
  return identities[projectId] ?? null
}

/** Refresh persisted signed URLs before a restored draft can reuse them. */
export async function refreshProductIdentity<T extends ProductIdentitySelection>(
  identity: T,
  sign: (url: string) => Promise<string | null>,
): Promise<T | null> {
  const results = await Promise.allSettled(approvedProductViewUrls(identity.url, identity.urls).map(sign))
  const urls = approvedProductViewUrls(null, results.flatMap((result) =>
    result.status === 'fulfilled' && result.value ? [result.value] : [],
  ))
  return urls.length ? { ...identity, url: urls[0], urls } : null
}

/** Change one draft without replacing identities still being restored in memory. */
export function persistProjectProductIdentity(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
  projectId: string,
  product: ProductIdentitySelection | null,
): void {
  let identities: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      identities = { ...parsed }
    }
  } catch { /* Invalid stored JSON has no recoverable identities. */ }
  if (product) identities[projectId] = product
  else delete identities[projectId]
  storage.setItem(key, JSON.stringify(identities))
}

/** Late URL refresh must not restore a selection changed or removed by the user. */
export function mergeRestoredProductIdentities<T>(
  restored: Readonly<Record<string, T>>,
  current: Readonly<Record<string, T>>,
  touched: ReadonlySet<string>,
): Record<string, T> {
  return { ...Object.fromEntries(Object.entries(restored).filter(([id]) => !touched.has(id))), ...current }
}

/** Description edits address image rows; selections may address their product group. */
export function productDescriptionUpdates<T extends ProductPhotoGroupItem>(
  groups: readonly ProductPhotoGroup<T>[],
  imageIds: readonly string[],
  description: string | null,
): Map<string, string | null> {
  const ids = new Set(imageIds)
  const updates = new Map(imageIds.map((id) => [id, description]))
  for (const group of groups) {
    if (group.photos.some((photo) => ids.has(photo.id))) updates.set(group.id, description)
  }
  return updates
}

export function applyProductDescriptionUpdates<T extends { id: string; description?: string | null }>(
  identities: Readonly<Record<string, T>>,
  updates: ReadonlyMap<string, string | null>,
): Record<string, T> {
  return Object.fromEntries(Object.entries(identities).map(([scope, identity]) => [
    scope,
    identity && updates.has(identity.id) ? { ...identity, description: updates.get(identity.id) } : identity,
  ]))
}

/** Update unloaded drafts as well as the active one, without replacing their other fields. */
export function persistProductDescriptionUpdates(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
  updates: ReadonlyMap<string, string | null>,
): void {
  const raw = storage.getItem(key)
  if (!raw) return
  const identities = JSON.parse(raw) as Record<string, ProductIdentitySelection>
  if (!identities || typeof identities !== 'object' || Array.isArray(identities)) return
  storage.setItem(key, JSON.stringify(applyProductDescriptionUpdates(identities, updates)))
}
