import { parseStorageRef } from "./proxiedVideoUrl";

export type StorageRemover = (
  paths: string[],
) => PromiseLike<{ error: { message?: string } | null }>;

/**
 * Removes a merged Final Film's storage objects: the Final Film poster
 * (`<userId>/posters/<filmId>.<ext>`, referenced only by video.thumbnail_url)
 * and the video file. Supabase Storage reports ordinary failures in the
 * returned `{ error }` rather than throwing, so each one is rethrown here and
 * reaches the caller's rollback instead of silently orphaning the object.
 *
 * The poster goes first: if it cannot be removed, the film is still fully
 * intact when the caller restores the card.
 */
export async function purgeMergedFilmStorage(
  refs: { video?: string | null; poster?: string | null },
  bucket: string,
  remove: StorageRemover,
): Promise<void> {
  const posterRef = parseStorageRef(refs.poster);
  if (posterRef?.bucket === bucket && posterRef.path.includes("/posters/")) {
    await removeOrThrow(remove, posterRef.path);
  }
  // Matches BOTH the legacy full-URL form and the bucket-relative
  // "<bucket>/<path>" form persisted since #202.
  const videoRef = parseStorageRef(refs.video);
  if (videoRef?.bucket === bucket) {
    await removeOrThrow(remove, videoRef.path);
  }
}

async function removeOrThrow(remove: StorageRemover, path: string): Promise<void> {
  const { error } = await remove([path]);
  if (error) {
    throw new Error(`Could not remove ${path}: ${error.message ?? "storage error"}`);
  }
}
