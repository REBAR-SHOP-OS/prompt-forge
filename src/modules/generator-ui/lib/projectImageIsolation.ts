export type ProjectScopedImage = {
  id: string
  category?: string | null
}

type VisibleProjectImagesInput<T extends ProjectScopedImage> = {
  userImages: readonly T[]
  selectedProjectId: string | null
  projectSourceImages: Readonly<Record<string, readonly T[]>>
  draftSourceImages: Readonly<Record<string, readonly T[]>>
  activeDraftId: string | null
  workspaceHiddenImageIds: ReadonlySet<string>
  coverImageIds: ReadonlySet<string>
  activeImageIds: ReadonlySet<string>
}

const isGenerationSource = (image: ProjectScopedImage): boolean => {
  const category = image.category ?? 'general'
  return category !== 'reframe' && category !== 'cover'
}

/**
 * Resolve images for the right Pending panel without crossing project scopes.
 * Any selected project is authoritative: an empty or missing snapshot renders
 * no images instead of falling through to the user's workspace-wide images.
 */
export function resolveVisibleProjectImages<T extends ProjectScopedImage>({
  userImages,
  selectedProjectId,
  projectSourceImages,
  draftSourceImages,
  activeDraftId,
  workspaceHiddenImageIds,
  coverImageIds,
  activeImageIds,
}: VisibleProjectImagesInput<T>): T[] {
  if (selectedProjectId) {
    const snapshot = Object.prototype.hasOwnProperty.call(projectSourceImages, selectedProjectId)
      ? projectSourceImages[selectedProjectId]
      : Object.prototype.hasOwnProperty.call(draftSourceImages, selectedProjectId)
        ? draftSourceImages[selectedProjectId]
        : []
    const liveById = new Map(userImages.map((image) => [image.id, image]))
    return snapshot
      .map((image) => liveById.get(image.id) ?? image)
      .filter((image) => !coverImageIds.has(image.id) && isGenerationSource(image))
  }

  const claimedByProjects = new Set<string>()
  for (const images of Object.values(projectSourceImages)) {
    for (const image of images) claimedByProjects.add(image.id)
  }
  for (const [draftId, images] of Object.entries(draftSourceImages)) {
    if (draftId === activeDraftId) continue
    for (const image of images) claimedByProjects.add(image.id)
  }

  return userImages.filter(
    (image) =>
      activeImageIds.has(image.id) &&
      !workspaceHiddenImageIds.has(image.id) &&
      !claimedByProjects.has(image.id) &&
      !coverImageIds.has(image.id) &&
      isGenerationSource(image),
  )
}

/**
 * Legacy image backfill accepts only an explicit image-to-project ownership
 * map. Timestamps are intentionally absent from the contract: chronological
 * proximity is not evidence that an image belongs to a finalized project.
 */
export function selectLegacyProjectImagesByOwnerId<T extends { id: string }>(
  images: readonly T[],
  projectId: string,
  projectIdByImageId: Readonly<Record<string, string>>,
): T[] {
  return images.filter((image) => projectIdByImageId[image.id] === projectId)
}
