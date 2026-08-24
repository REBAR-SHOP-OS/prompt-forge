// Pure helpers for film cover scoping.
//
// A cover is valid ONLY when the user has explicitly created/selected it for
// the current project scope (selectedProjectId or activeDraftId). Covers must
// never auto-carry between draft → finalized, finalized → draft, or across
// Start Over. These helpers keep the logic side-effect free and testable.

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