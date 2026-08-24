// Pure helpers for the draggable central Preview position.
//
// The preview frame is kept in its normal grid-centered flow and moved with a
// CSS `translate(x, y)` offset. `clampOffset` keeps that offset inside the safe
// workspace (the central area minus the fixed right/left sidebars and the
// bottom composer). Everything here is side-effect free so it can be unit
// tested without a DOM.

export type PreviewOffset = { x: number; y: number }

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export const ZERO_OFFSET: PreviewOffset = { x: 0, y: 0 }
export const DEFAULT_OFFSET: PreviewOffset = { x: 0, y: 24 }

/**
 * Clamp a translate offset so the preview frame (given its *untranslated*
 * centered rect) stays fully inside the safe workspace rect.
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
 * Compute the safe workspace rect from the central workspace area and the
 * fixed overlays. Any overlay that is absent (null) is ignored.
 */
export function computeSafeRect(
  workspace: Rect,
  rightSidebar: Rect | null,
  leftSidebar: Rect | null,
  composer: Rect | null,
  header: Rect | null = null,
): Rect {
  let left = workspace.left
  let right = workspace.right
  let top = workspace.top
  let bottom = workspace.bottom
  if (rightSidebar) right = Math.min(right, rightSidebar.left)
  if (leftSidebar) left = Math.max(left, leftSidebar.right)
  if (composer) bottom = Math.min(bottom, composer.top)
  if (header) top = Math.max(top, header.bottom)
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
