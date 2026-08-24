import { GripHorizontal, RotateCcw } from 'lucide-react'
import type { PreviewPosition } from '@/modules/generator-ui/hooks/usePreviewPosition'

type Props = {
  position: PreviewPosition
  /** The preview frame element (untranslated, grid-centered). */
  frameRef: React.RefObject<HTMLElement | null>
  children: React.ReactNode
}

/**
 * Wraps the central Preview so it can be dragged by a small handle and reset to
 * center. The frame stays in normal grid flow; only a `translate` offset moves
 * it. Dragging starts exclusively from the handle, never from the video
 * surface or its controls.
 */
export function DraggablePreview({ position, frameRef, children }: Props) {
  const { offset, dragging, disabled, onHandlePointerDown, reset } = position

  return (
    <div
      ref={frameRef}
      className="relative"
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: dragging ? 'none' : 'transform 120ms ease-out',
        willChange: 'transform',
      }}
    >
      {!disabled && (
        <div className="absolute -top-9 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1">
          <button
            type="button"
            onPointerDown={onHandlePointerDown}
            aria-label="Drag preview"
            title="Drag preview"
            className="grid h-7 w-7 cursor-grab touch-none select-none place-items-center rounded-md border border-border bg-surface-2/80 text-foreground/80 backdrop-blur transition hover:border-border hover:text-foreground active:cursor-grabbing"
          >
            <GripHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={reset}
            aria-label="Reset preview position"
            title="Reset position"
            className="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface-2/80 text-foreground/80 backdrop-blur transition hover:border-border hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      {children}
    </div>
  )
}
