import { sanitizeProductName } from './makeFilmWizard'

export interface ProductPhotoGroupItem {
  id: string
  title?: string | null
  storagePath?: string | null
  storage_path?: string | null
}

export interface ProductPhotoGroup<T extends ProductPhotoGroupItem> {
  id: string
  name: string
  photos: T[]
}

function productGroupKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * New product-folder uploads use a durable virtual-folder segment in the
 * existing user-images bucket. Legacy rows do not have this segment and keep
 * the title-based grouping introduced before explicit folders existed.
 */
export function storedProductFolderId(photo: ProductPhotoGroupItem): string | null {
  const storagePath = photo.storagePath ?? photo.storage_path ?? ''
  const withoutQuery = storagePath.split('?')[0]
  try {
    const decoded = decodeURIComponent(withoutQuery)
    return decoded.match(/(?:^|\/)products\/([^/]+)\//)?.[1] ?? null
  } catch {
    return withoutQuery.match(/(?:^|\/)products\/([^/]+)\//)?.[1] ?? null
  }
}

export function normalizeProductFolderName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 100)
}

export function productFolderNameKey(name: string): string {
  return productGroupKey(normalizeProductFolderName(name))
}

export function productPhotoStoragePath(
  userId: string,
  folderId: string,
  objectId: string,
  fileName: string,
): string {
  const ext = (fileName.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  return `${userId}/products/${folderId}/${objectId}.${ext}`
}

/**
 * Explicit virtual-folder ids are the source of truth for new uploads. Treat
 * legacy numbered uploads such as "Rebar Stirrup 001" and "Rebar Stirrup 008"
 * as different views of one product. Untitled legacy rows stay separate so
 * unrelated uploads are never merged just because both lack a name.
 */
export function groupProductPhotos<T extends ProductPhotoGroupItem>(photos: readonly T[]): ProductPhotoGroup<T>[] {
  const groups = new Map<string, ProductPhotoGroup<T>>()

  for (const photo of photos) {
    const rawTitle = photo.title?.trim() ?? ''
    const folderId = storedProductFolderId(photo)
    const name = folderId ? normalizeProductFolderName(rawTitle) || 'Selected Product' : sanitizeProductName(rawTitle)
    const key = folderId ? `folder:${folderId}` : rawTitle ? productGroupKey(name) : `untitled:${photo.id}`
    const current = groups.get(key)

    if (current) {
      current.photos.push(photo)
    } else {
      groups.set(key, { id: key, name, photos: [photo] })
    }
  }

  return [...groups.values()]
}

/** Keep angle choice deterministic so regenerating a scene uses the same view. */
export function productPhotoForScene<T>(photos: readonly T[], sceneIndex: number): T | undefined {
  if (photos.length === 0) return undefined
  const index = Math.max(0, Math.trunc(sceneIndex)) % photos.length
  return photos[index]
}
