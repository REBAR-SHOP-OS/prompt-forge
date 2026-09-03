import { sanitizeProductName } from './makeFilmWizard'

export interface ProductPhotoGroupItem {
  id: string
  title?: string | null
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
 * Treat numbered uploads such as "Rebar Stirrup 001" and "Rebar Stirrup 008"
 * as different views of one product. Untitled rows stay separate so unrelated
 * uploads are never merged just because both lack a name.
 */
export function groupProductPhotos<T extends ProductPhotoGroupItem>(photos: readonly T[]): ProductPhotoGroup<T>[] {
  const groups = new Map<string, ProductPhotoGroup<T>>()

  for (const photo of photos) {
    const rawTitle = photo.title?.trim() ?? ''
    const name = sanitizeProductName(rawTitle)
    const key = rawTitle ? productGroupKey(name) : `untitled:${photo.id}`
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
