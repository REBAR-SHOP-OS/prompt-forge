import type { JobDetail } from '@/modules/job-orchestrator/contract'

type LibraryImage = {
  storage_path: string
}

export type LibraryCardPreviewAsset =
  | { kind: 'video'; video: NonNullable<JobDetail['video']> }
  | { kind: 'image'; image: LibraryImage }

export function resolveDraftLibraryPreview(
  draftId: string,
  clips: JobDetail[],
  images: LibraryImage[],
  entry?: JobDetail,
): LibraryCardPreviewAsset | null {
  const firstClip = clips.find((clip) => Boolean(clip.video?.storage_path))
  if (firstClip?.video?.storage_path) {
    return {
      kind: 'video',
      video: {
        id: firstClip.video.id ?? draftId,
        storage_path: firstClip.video.storage_path,
        thumbnail_url: firstClip.video.thumbnail_url ?? null,
        aspect_ratio: firstClip.video.aspect_ratio ?? entry?.requested_aspect_ratio ?? null,
        duration: firstClip.video.duration ?? null,
      },
    }
  }

  const firstImage = images.find((image) => Boolean(image.storage_path))
  if (firstImage) return { kind: 'image', image: firstImage }

  if (entry?.video?.storage_path) return { kind: 'video', video: entry.video }

  return null
}
