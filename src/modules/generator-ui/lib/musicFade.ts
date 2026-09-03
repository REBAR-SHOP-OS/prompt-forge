export type MusicFadeDurations = {
  fadeInSec: number
  fadeOutSec: number
}

function nonNegativeFinite(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : 0
}

/**
 * Keep the two fades inside the active music timeline. When persisted or
 * programmatic values overlap, preserve their ratio and meet in the middle.
 */
export function resolveMusicFadeDurations(
  fadeInSec: number | undefined,
  fadeOutSec: number | undefined,
  timelineDurationSec: number,
): MusicFadeDurations {
  const duration = timelineDurationSec === Number.POSITIVE_INFINITY
    ? Number.POSITIVE_INFINITY
    : nonNegativeFinite(timelineDurationSec)
  let fadeIn = nonNegativeFinite(fadeInSec)
  let fadeOut = nonNegativeFinite(fadeOutSec)
  if (!Number.isFinite(duration)) return { fadeInSec: fadeIn, fadeOutSec: fadeOut }
  const total = fadeIn + fadeOut
  if (total > duration && total > 0) {
    const scale = duration / total
    fadeIn *= scale
    fadeOut *= scale
  }
  return { fadeInSec: fadeIn, fadeOutSec: fadeOut }
}

/** Linear music gain envelope at a film-wide playhead position. */
export function musicGainAtFilmTime(args: {
  filmTimeSec: number
  timelineStartSec: number
  timelineEndSec: number
  volume: number
  fadeInSec?: number
  fadeOutSec?: number
}): number {
  const start = nonNegativeFinite(args.timelineStartSec)
  const end = args.timelineEndSec === Number.POSITIVE_INFINITY
    ? Number.POSITIVE_INFINITY
    : Math.max(start, nonNegativeFinite(args.timelineEndSec))
  const time = nonNegativeFinite(args.filmTimeSec)
  if (end <= start || time < start || time >= end) return 0

  const volume = Math.max(0, Math.min(1, nonNegativeFinite(args.volume)))
  const fades = resolveMusicFadeDurations(args.fadeInSec, args.fadeOutSec, end - start)
  const fadeInGain = fades.fadeInSec > 0
    ? Math.min(1, (time - start) / fades.fadeInSec)
    : 1
  const fadeOutGain = fades.fadeOutSec > 0
    ? Math.min(1, (end - time) / fades.fadeOutSec)
    : 1
  return volume * Math.max(0, Math.min(fadeInGain, fadeOutGain))
}

/** Schedule the same envelope for sample-accurate OfflineAudioContext output. */
export function scheduleMusicFade(
  gain: AudioParam,
  args: {
    timelineStartSec: number
    timelineEndSec: number
    volume: number
    fadeInSec?: number
    fadeOutSec?: number
  },
): void {
  const start = nonNegativeFinite(args.timelineStartSec)
  const end = Math.max(start, nonNegativeFinite(args.timelineEndSec))
  if (end <= start) return
  const volume = Math.max(0, Math.min(1, nonNegativeFinite(args.volume)))
  const fades = resolveMusicFadeDurations(args.fadeInSec, args.fadeOutSec, end - start)

  gain.cancelScheduledValues(start)
  gain.setValueAtTime(fades.fadeInSec > 0 ? 0 : volume, start)
  if (fades.fadeInSec > 0) gain.linearRampToValueAtTime(volume, start + fades.fadeInSec)
  if (fades.fadeOutSec > 0) {
    gain.setValueAtTime(volume, end - fades.fadeOutSec)
    gain.linearRampToValueAtTime(0, end)
  } else {
    gain.setValueAtTime(volume, end)
  }
}
