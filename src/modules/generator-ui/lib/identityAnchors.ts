export interface IdentityAnchor {
  url?: string | null
}

/**
 * The visible character selection is the only authority for applying character
 * identity to generation. Persisted continuity may contain stale characterRef
 * data from older sessions, so callers must not use it as a fallback.
 */
export function explicitCharacterAnchor<T extends IdentityAnchor>(
  selectedCharacter: T | null | undefined,
): T | null {
  return selectedCharacter?.url ? selectedCharacter : null
}

export function buildReferenceImageUrls(
  anchors: Array<string | null | undefined>,
  limit = 3,
): string[] | undefined {
  const urls = anchors.filter((u): u is string => typeof u === 'string' && u.length > 0)
  return urls.length > 0 ? urls.slice(0, limit) : undefined
}
