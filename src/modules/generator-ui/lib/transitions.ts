import type { TransitionId, TransitionSpec } from '@/modules/generator-ui/lib/mergeVideos'

export type TransitionGroup = 'Basic' | 'Movement' | 'Reveal' | 'Dynamic'

export interface TransitionOption {
  id: TransitionId
  label: string
  description: string
  defaultMs: number
}

export interface TransitionGroupDef {
  group: TransitionGroup
  items: TransitionOption[]
}

/**
 * Canonical transition catalog. Grouped for the picker UI; the engine only
 * cares about the `id` + `durationMs` pair (see TransitionSpec).
 */
export const TRANSITION_GROUPS: TransitionGroupDef[] = [
  {
    group: 'Basic',
    items: [
      { id: 'cut', label: 'Cut', description: 'Instant switch with no effect', defaultMs: 0 },
      { id: 'fade', label: 'Fade', description: 'Fade out to black, then in', defaultMs: 500 },
      { id: 'crossfade', label: 'Crossfade', description: 'Dissolve one clip into the next', defaultMs: 500 },
    ],
  },
  {
    group: 'Movement',
    items: [
      { id: 'slide-left', label: 'Slide Left', description: 'Next clip slides in from the right', defaultMs: 500 },
      { id: 'slide-right', label: 'Slide Right', description: 'Next clip slides in from the left', defaultMs: 500 },
    ],
  },
  {
    group: 'Reveal',
    items: [
      { id: 'wipe', label: 'Wipe', description: 'An edge sweeps across to reveal', defaultMs: 500 },
    ],
  },
  {
    group: 'Dynamic',
    items: [
      { id: 'zoom', label: 'Zoom', description: 'Zoom out while crossfading', defaultMs: 500 },
    ],
  },
]

export const TRANSITION_LABEL: Record<TransitionId, string> = TRANSITION_GROUPS.reduce(
  (acc, g) => {
    for (const item of g.items) acc[item.id] = item.label
    return acc
  },
  {} as Record<TransitionId, string>,
)

export const DEFAULT_TRANSITION_DURATION: Record<TransitionId, number> = TRANSITION_GROUPS.reduce(
  (acc, g) => {
    for (const item of g.items) acc[item.id] = item.defaultMs
    return acc
  },
  {} as Record<TransitionId, number>,
)

/** Safe duration window the merge engine handles without clipping artifacts. */
export const MIN_TRANSITION_MS = 200
export const MAX_TRANSITION_MS = 1000

export const DURATION_PRESETS: { label: string; ms: number }[] = [
  { label: 'Fast', ms: 300 },
  { label: 'Normal', ms: 500 },
  { label: 'Smooth', ms: 800 },
]

export function clampTransitionDuration(ms: number): number {
  if (!Number.isFinite(ms)) return 500
  return Math.min(MAX_TRANSITION_MS, Math.max(MIN_TRANSITION_MS, Math.round(ms)))
}

/** Build a TransitionSpec for an id, defaulting to the catalog duration. */
export function transitionSpecFor(id: TransitionId, durationMs?: number): TransitionSpec {
  if (id === 'cut') return { id, durationMs: 0 }
  const base = DEFAULT_TRANSITION_DURATION[id] ?? 500
  return { id, durationMs: clampTransitionDuration(durationMs ?? base) }
}

/** Apply one spec to every gap (clip ids that precede a transition). */
export function applyTransitionToAll(
  transitions: Record<string, TransitionSpec>,
  gapIds: string[],
  spec: TransitionSpec,
): Record<string, TransitionSpec> {
  const next = { ...transitions }
  for (const id of gapIds) next[id] = spec
  return next
}
