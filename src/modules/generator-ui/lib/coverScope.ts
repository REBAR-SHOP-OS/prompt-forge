// Pure helpers for film cover scoping.
//
// A cover is valid ONLY when the user has explicitly created/selected it for
// the current project scope (selectedProjectId or activeDraftId). A cover may
// move only when that same project changes lifecycle scope (draft → final or
// final → reopened draft); it must never leak into another project or Start Over.
// These helpers keep the logic side-effect free and testable.

import type { UserImageItem } from '@/modules/generator-ui/pages/DashboardPage'

export type CoverMap = Record<string, UserImageItem>
export type CoverDurationMap = Record<string, number>

/**
 * Return the cover for the current scope, or null if none exists.
 * A null scope key means no project is active — always returns null.
 */
export function getCoverForScope(
  covers: CoverMap,
  scopeKey: string | null,
): UserImageItem | null {
  return scopeKey ? (covers[scopeKey] ?? null) : null
}

/**
 * Return the cover duration for the current scope, or the default.
 */
export function getCoverDurationForScope(
  durations: CoverDurationMap,
  scopeKey: string | null,
  defaultDuration: number,
): number {
  if (!scopeKey) return defaultDuration
  return Math.max(1, Math.min(10, durations[scopeKey] ?? defaultDuration))
}

/**
 * Remove the cover association for a scope WITHOUT deleting the underlying
 * image file. Returns a new map; does not mutate the input.
 */
export function clearCoverForScope(
  covers: CoverMap,
  scopeKey: string | null,
): CoverMap {
  if (!scopeKey || !(scopeKey in covers)) return covers
  const { [scopeKey]: _drop, ...rest } = covers
  return rest
}

/**
 * Remove the cover duration for a scope. Returns a new map.
 */
export function clearCoverDurationForScope(
  durations: CoverDurationMap,
  scopeKey: string | null,
): CoverDurationMap {
  if (!scopeKey || !(scopeKey in durations)) return durations
  const { [scopeKey]: _drop, ...rest } = durations
  return rest
}

/** Move a cover when the same project changes lifecycle scope. */
export function moveCoverBetweenScopes(
  covers: CoverMap,
  fromScopeKey: string | null,
  toScopeKey: string | null,
): CoverMap {
  if (!fromScopeKey || !toScopeKey || fromScopeKey === toScopeKey || !covers[fromScopeKey]) return covers
  const cover = covers[fromScopeKey]
  const { [fromScopeKey]: _moved, ...rest } = covers
  return { ...rest, [toScopeKey]: cover }
}

/** Move the matching cover duration with its cover. */
export function moveCoverDurationBetweenScopes(
  durations: CoverDurationMap,
  fromScopeKey: string | null,
  toScopeKey: string | null,
): CoverDurationMap {
  if (!fromScopeKey || !toScopeKey || fromScopeKey === toScopeKey || !(fromScopeKey in durations)) return durations
  const duration = durations[fromScopeKey]
  const { [fromScopeKey]: _moved, ...rest } = durations
  return { ...rest, [toScopeKey]: duration }
}

/**
 * Determine whether a cover should be included in the Final Film merge.
 * Returns true ONLY when an explicitly selected cover exists for the current
 * scope. The mere presence of covers in other scopes is not sufficient.
 */
export function shouldIncludeCoverInMerge(
  covers: CoverMap,
  scopeKey: string | null,
): boolean {
  return getCoverForScope(covers, scopeKey) !== null
}