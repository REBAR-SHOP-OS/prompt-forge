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

  if (entry?.video?.storage_path) {
    // DashboardPage builds `entry.video` as a STUB for image-only drafts:
    //   { id, storage_path: <image>, thumbnail_url: <the same image>, duration: null }
    // Routing that stub to PlayableVideo is the exact bug this module exists to
    // fix, and it resurfaces through this fallback whenever `images` is empty or
    // not yet rehydrated — cleared localStorage, a different browser, or the
    // first paint before the snapshot loads.
    //
    // A real clip's `thumbnail_url` is a poster frame, never its own
    // `storage_path`, so the two being equal (with no duration) identifies the
    // image stub without guessing from the file extension.
    const isImageStub =
      entry.video.duration == null &&
      !!entry.video.thumbnail_url &&
      entry.video.thumbnail_url === entry.video.storage_path
    if (isImageStub) {
      return { kind: 'image', image: { storage_path: entry.video.storage_path } }
    }
    return { kind: 'video', video: entry.video }
  }

  return null
}
