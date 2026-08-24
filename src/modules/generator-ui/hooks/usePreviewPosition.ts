import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clampOffset,
  computeSafeRect,
  loadPreviewOffset,
  savePreviewOffset,
  type PreviewOffset,
  type Rect,
  ZERO_OFFSET,
} from '@/modules/generator-ui/lib/previewPosition'

export interface PreviewPositionRefs {
  /** The central workspace area the preview lives in. */
  workspace: React.RefObject<HTMLElement | null>
  /** The fixed right "Pending" sidebar. */
  rightSidebar: React.RefObject<HTMLElement | null>
  /** The fixed left "Library" sidebar (only visible when open). */
  leftSidebar: React.RefObject<HTMLElement | null>
  /** The fixed bottom composer. */
  composer: React.RefObject<HTMLElement | null>
  /** The preview frame itself (untranslated, grid-centered). */
  frame: React.RefObject<HTMLElement | null>
}

export interface PreviewPosition {
  /** Current translate offset (px). */
  offset: PreviewOffset
  /** True while a drag is in progress. */
  dragging: boolean
  /** True when dragging is disabled (small viewport). */
  disabled: boolean
  /** Start a drag from the handle. */
  onHandlePointerDown: (e: React.PointerEvent<HTMLElement>) => void
  /** Reset the offset back to centered. */
  reset: () => void
}

function rectOf(el: HTMLElement | null): Rect | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
}

const MOBILE_BREAKPOINT = 768

/**
 * Draggable central Preview position.
 *
 * The preview stays in its normal grid-centered flow; this hook only manages a
 * `translate(x, y)` offset that is clamped to the safe workspace (central area
 * minus the right/left sidebars and the bottom composer). The offset is
 * persisted per-user in localStorage and restored on mount. On small viewports
 * dragging is disabled and the preview keeps its centered behavior.
 */
export function usePreviewPosition(
  userId: string | null,
  refs: PreviewPositionRefs,
): PreviewPosition {
  const [offset, setOffset] = useState<PreviewOffset>(() => loadPreviewOffset(userId))
  const [dragging, setDragging] = useState(false)
  const [disabled, setDisabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  // Keep the disabled flag in sync with viewport resizes.
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setDisabled(window.innerWidth < MOBILE_BREAKPOINT)
    mql.addEventListener('change', onChange)
    setDisabled(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  // Re-clamp the stored offset whenever the layout changes (resize, sidebar
  // open/close, composer height) so the preview never drifts out of bounds.
  useEffect(() => {
    if (disabled) return
    const frame = rectOf(refs.frame.current)
    if (!frame) return
    const safe = computeSafeRect(
      rectOf(refs.workspace.current) ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight },
      rectOf(refs.rightSidebar.current),
      rectOf(refs.leftSidebar.current),
      rectOf(refs.composer.current),
    )
    setOffset((prev) => {
      const next = clampOffset(prev, frame, safe)
      return next.x === prev.x && next.y === prev.y ? prev : next
    })
  }, [disabled, refs.workspace, refs.rightSidebar, refs.leftSidebar, refs.composer, refs.frame])

  // Persist the offset per-user (debounced lightly via effect on change).
  useEffect(() => {
    savePreviewOffset(userId, offset)
  }, [userId, offset])

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled) return
      const frame = rectOf(refs.frame.current)
      const workspace = rectOf(refs.workspace.current)
      if (!frame || !workspace) return
      e.preventDefault()
      e.stopPropagation()
      const target = e.currentTarget
      try {
        target.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      setDragging(true)
      const startX = e.clientX
      const startY = e.clientY
      const startOffset = offset

      const apply = (clientX: number, clientY: number) => {
        const safe = computeSafeRect(
          workspace,
          rectOf(refs.rightSidebar.current),
          rectOf(refs.leftSidebar.current),
          rectOf(refs.composer.current),
        )
        const raw = {
          x: startOffset.x + (clientX - startX),
          y: startOffset.y + (clientY - startY),
        }
        setOffset(clampOffset(raw, frame, safe))
      }

      const onMove = (ev: PointerEvent) => apply(ev.clientX, ev.clientY)
      const onUp = () => {
        setDragging(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        try {
          target.releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [disabled, offset, refs.frame, refs.workspace, refs.rightSidebar, refs.leftSidebar, refs.composer],
  )

  const reset = useCallback(() => setOffset(ZERO_OFFSET), [])

  return { offset, dragging, disabled, onHandlePointerDown, reset }
}
