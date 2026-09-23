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
 *
 * Accepts an absent photo (an empty folder with zero photos has no row to
 * read an id from) and returns null rather than throwing.
 */
export function storedProductFolderId(photo: ProductPhotoGroupItem | null | undefined): string | null {
  if (!photo) return null
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

/** A durably persisted, possibly still-empty product folder (see product_folders table). */
export interface ProductFolderRecord {
  storageFolderId: string
  name: string
}

/**
 * Merge photo-derived groups with persisted folder rows that have no photos
 * yet. A folder created with zero photos has no generator_user_images row to
 * derive a group from, so without this merge it would disappear the moment
 * the page remounts. Persisted folders already covered by a photo group are
 * skipped so the same folder is never rendered twice.
 */
export function mergeEmptyProductFolders<T extends ProductPhotoGroupItem>(
  photoGroups: readonly ProductPhotoGroup<T>[],
  persistedFolders: readonly ProductFolderRecord[],
): ProductPhotoGroup<T>[] {
  const covered = new Set(photoGroups.map((group) => group.id))
  const emptyGroups: ProductPhotoGroup<T>[] = persistedFolders
    .filter((folder) => !covered.has(`folder:${folder.storageFolderId}`))
    .map((folder) => ({ id: `folder:${folder.storageFolderId}`, name: folder.name, photos: [] as T[] }))
  return [...photoGroups, ...emptyGroups]
}

/**
 * Resolve the storage-folder id backing a rendered group so it stays a valid
 * upload target even when the group has no photos yet (storedProductFolderId
 * needs a photo row to read the id from; an empty group has none).
 */
export function productFolderStorageId<T extends ProductPhotoGroupItem>(
  group: ProductPhotoGroup<T>,
  persistedFolders: readonly ProductFolderRecord[],
): string | null {
  if (group.photos.length > 0) return storedProductFolderId(group.photos[0])
  return persistedFolders.find((folder) => `folder:${folder.storageFolderId}` === group.id)?.storageFolderId ?? null
}
