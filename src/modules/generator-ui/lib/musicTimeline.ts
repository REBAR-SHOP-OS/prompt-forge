// Pure helper for the music-timeline auto-extend rule.
//
// When a new clip grows the project, a music track that was previously covering
// the full film should auto-extend to the new end so the new clip isn't silent.
// A manually-shortened timeline is left untouched.

export interface MusicTimelineState {
  /** Previous film length in seconds (before the new clip was added). */
  prevDurationSec: number
  /** New film length in seconds (after the new clip was added). */
  nextDurationSec: number
  /** Whether a music track is currently applied. */
  hasMusic: boolean
  /** Whether the music source range is valid (end > start). */
  hasMusicRange: boolean
  /** Current music timeline [start, end] in seconds. */
  timeline: [number, number]
}

/**
 * Returns the new music timeline end, or `null` when the timeline should not
 * change. Full-length is represented by an unset timeline ([0,0]) or an end
 * that reached the previous film length; anything shorter is a manual trim.
 */
export function resolveMusicTimelineEnd(state: MusicTimelineState): number | null {
  const { prevDurationSec, nextDurationSec, hasMusic, hasMusicRange, timeline } = state
  if (nextDurationSec <= prevDurationSec) return null
  if (!hasMusic || !hasMusicRange) return null
  const [, end] = timeline
  const wasFullLength = end === 0 || end >= prevDurationSec
  if (!wasFullLength) return null
  return nextDurationSec
}
