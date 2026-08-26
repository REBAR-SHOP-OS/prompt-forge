// Pure helpers for the draggable central Preview position.
//
// The preview frame is kept in its normal grid-centered flow and moved with a
// CSS `translate(x, y)` offset. `clampOffset` keeps that offset inside the safe
// area (the full viewport minus the fixed right/left sidebars, the bottom
// composer, and the top header). Everything here is side-effect free so it can
// be unit tested without a DOM.

export type PreviewOffset = { x: number; y: number }

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export const ZERO_OFFSET: PreviewOffset = { x: 0, y: 0 }
export const DEFAULT_OFFSET: PreviewOffset = { x: 0, y: 40 }

/**
 * The previous default offset. Users who never moved the preview have this
 * exact value persisted; we migrate it to the new default so they pick up the
 * corrected position, while any other stored value (a real custom position)
 * is preserved untouched.
 */
export const LEGACY_DEFAULT_OFFSET: PreviewOffset = { x: 0, y: 24 }

/** Small safety margin (px) kept between the preview frame and the viewport edge. */
export const SAFE_MARGIN = 8

/**
 * Clamp a translate offset so the preview frame (given its *untranslated*
 * centered rect) stays fully inside the safe rect.
 *
 * When the safe area is narrower/shorter than the frame on an axis, the frame
 * cannot move on that axis and the offset is forced back to 0 (centered).
 */
export function clampOffset(offset: PreviewOffset, frame: Rect, safe: Rect): PreviewOffset {
  const minX = safe.left - frame.left
  const maxX = safe.right - frame.right
  const minY = safe.top - frame.top
  const maxY = safe.bottom - frame.bottom
  const x = maxX < minX ? 0 : Math.min(maxX, Math.max(minX, offset.x))
  const y = maxY < minY ? 0 : Math.min(maxY, Math.max(minY, offset.y))
  return { x, y }
}

/**
 * Compute the safe rect for the preview frame, starting from the full
 * viewport (not just the central workspace element) and subtracting the
 * fixed overlays — header, right sidebar, left sidebar, and bottom composer.
 * A small `SAFE_MARGIN` is kept from each edge so the preview never touches
 * the viewport boundary. Any overlay that is absent (null) is ignored.
 */
export function computeSafeRect(
  viewport: Rect,
  rightSidebar: Rect | null,
  leftSidebar: Rect | null,
  composer: Rect | null,
  header: Rect | null = null,
): Rect {
  let left = viewport.left + SAFE_MARGIN
  let right = viewport.right - SAFE_MARGIN
  let top = viewport.top + SAFE_MARGIN
  let bottom = viewport.bottom - SAFE_MARGIN
  if (rightSidebar) right = Math.min(right, rightSidebar.left - SAFE_MARGIN)
  if (leftSidebar) left = Math.max(left, leftSidebar.right + SAFE_MARGIN)
  if (composer) bottom = Math.min(bottom, composer.top - SAFE_MARGIN)
  if (header) top = Math.max(top, header.bottom + SAFE_MARGIN)
  return { left, top, right, bottom }
}

export function previewOffsetStorageKey(userId: string): string {
  return `generator:previewOffset:${userId}`
}

export function loadPreviewOffset(userId: string | null): PreviewOffset {
  if (!userId) return DEFAULT_OFFSET
  try {
    const raw = window.localStorage.getItem(previewOffsetStorageKey(userId))
    if (!raw) return DEFAULT_OFFSET
    const parsed = JSON.parse(raw) as Partial<PreviewOffset>
    const x = typeof parsed.x === 'number' && Number.isFinite(parsed.x) ? parsed.x : 0
    const y = typeof parsed.y === 'number' && Number.isFinite(parsed.y) ? parsed.y : 0
    // Migrate the old default to the new default; preserve any real custom position.
    if (x === LEGACY_DEFAULT_OFFSET.x && y === LEGACY_DEFAULT_OFFSET.y) return DEFAULT_OFFSET
    return { x, y }
  } catch {
    return DEFAULT_OFFSET
  }
}

export function savePreviewOffset(userId: string | null, offset: PreviewOffset): void {
  if (!userId) return
  try {
    window.localStorage.setItem(previewOffsetStorageKey(userId), JSON.stringify(offset))
  } catch {
    /* ignore */
  }
}