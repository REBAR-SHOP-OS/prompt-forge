export type ProjectFilm = {
  created_at: string
  video?: { storage_path?: string | null } | null
}

/** Select the earliest playable film in the project, independent of snapshot array order. */
export function firstProjectFilmFrameUrl<T extends ProjectFilm>(films: readonly T[]): string | null {
  let first: { film: T; timestamp: number; index: number } | null = null
  films.forEach((film, index) => {
    if (!film.video?.storage_path) return
    const parsed = Date.parse(film.created_at)
    const timestamp = Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
    if (!first || timestamp < first.timestamp || (timestamp === first.timestamp && index < first.index)) {
      first = { film, timestamp, index }
    }
  })
  return first?.film.video?.storage_path ?? null
}

export type ShiftedAudioTimeline = {
  timelineStartSec: number
  timelineEndSec?: number
}

/** Keep the user-authored timeline relative to film content, then place it after the cover. */
export function shiftAudioTimelineAfterCover(
  timeline: readonly [number, number],
  renderedCoverDurationSec: number,
): ShiftedAudioTimeline {
  const coverOffset = Number.isFinite(renderedCoverDurationSec)
    ? Math.max(0, renderedCoverDurationSec)
    : 0
  const [rawStart, rawEnd] = timeline
  const hasExplicitTimeline = Number.isFinite(rawStart) && Number.isFinite(rawEnd) && rawEnd > rawStart
  const contentStart = hasExplicitTimeline ? Math.max(0, rawStart) : 0
  return {
    timelineStartSec: coverOffset + contentStart,
    timelineEndSec: hasExplicitTimeline ? coverOffset + Math.max(contentStart, rawEnd) : undefined,
  }
}
