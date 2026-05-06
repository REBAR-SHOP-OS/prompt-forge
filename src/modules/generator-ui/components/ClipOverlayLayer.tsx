import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipOverlay } from '@/modules/generator-ui/lib/overlays'
import { SignedImg } from '@/modules/generator-ui/components/SignedImg'

export interface ClipOverlayLayerProps {
  overlays: ClipOverlay[]
  editable?: boolean
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  onChange?: (id: string, patch: Partial<ClipOverlay>) => void
  className?: string
}

/**
 * Renders overlays absolutely on top of the parent (parent must be relative).
 * In editable mode, overlays are draggable via pointer events.
 */
export function ClipOverlayLayer({
  overlays,
  editable = false,
  selectedId = null,
  onSelect,
  onChange,
  className = '',
}: ClipOverlayLayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null)

  // Track container size for proportional sizing.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setContainerSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent, o: ClipOverlay) => {
    if (!editable) return
    e.stopPropagation()
    e.preventDefault()
    onSelect?.(o.id)
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    dragRef.current = { id: o.id, startX: e.clientX, startY: e.clientY, origX: o.x, origY: o.y }
  }, [editable, onSelect])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const dx = (e.clientX - drag.startX) / Math.max(1, rect.width)
    const dy = (e.clientY - drag.startY) / Math.max(1, rect.height)
    const nx = Math.min(1, Math.max(0, drag.origX + dx))
    const ny = Math.min(1, Math.max(0, drag.origY + dy))
    onChange?.(drag.id, { x: nx, y: ny })
  }, [onChange])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const target = e.currentTarget as HTMLElement
    try { target.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    dragRef.current = null
  }, [])

  const sorted = [...overlays].sort((a, b) => a.z_index - b.z_index)

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 ${editable ? '' : 'pointer-events-none'} ${className}`}
      onClick={(e) => {
        if (!editable) return
        if (e.target === e.currentTarget) onSelect?.(null)
      }}
    >
      {sorted.map((o) => {
        const isSelected = editable && selectedId === o.id
        const widthPx = o.scale * containerSize.w
        const left = `${o.x * 100}%`
        const top = `${o.y * 100}%`
        const transform = `translate(-50%, -50%) rotate(${o.rotation}deg)`

        if (o.kind === 'text') {
          const text = o.text_value ?? ''
          const fontSize = Math.max(8, Math.round(widthPx * 0.18))
          return (
            <div
              key={o.id}
              role={editable ? 'button' : undefined}
              tabIndex={editable ? 0 : -1}
              onPointerDown={(e) => handlePointerDown(e, o)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{
                position: 'absolute',
                left,
                top,
                transform,
                width: widthPx > 0 ? `${widthPx}px` : 'auto',
                fontFamily: o.font_family ? `"${o.font_family}", sans-serif` : 'Inter, sans-serif',
                fontWeight: o.font_weight ?? 700,
                fontSize: `${fontSize}px`,
                lineHeight: 1.2,
                color: o.color ?? '#fff',
                background: o.bg_color ?? 'transparent',
                textAlign: (o.text_align as 'left' | 'center' | 'right') ?? 'center',
                padding: o.bg_color ? `${fontSize * 0.25}px ${fontSize * 0.4}px` : 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                cursor: editable ? 'move' : 'default',
                userSelect: 'none',
                outline: isSelected ? '1px dashed rgba(255,255,255,0.8)' : 'none',
                outlineOffset: '2px',
              }}
            >
              {text}
            </div>
          )
        }

        return (
          <SignedImg
            key={o.id}
            src={o.image_url ?? ''}
            alt=""
            draggable={false}
            onPointerDown={(e) => handlePointerDown(e, o)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              position: 'absolute',
              left,
              top,
              transform,
              width: widthPx > 0 ? `${widthPx}px` : 'auto',
              height: 'auto',
              cursor: editable ? 'move' : 'default',
              userSelect: 'none',
              outline: isSelected ? '1px dashed rgba(255,255,255,0.8)' : 'none',
              outlineOffset: '2px',
              pointerEvents: editable ? 'auto' : 'none',
            }}
          />
        )
      })}
    </div>
  )
}
