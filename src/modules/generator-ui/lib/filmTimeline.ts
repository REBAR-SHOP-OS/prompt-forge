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
