import { useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Type, Image as ImageIcon, Trash2, Plus } from 'lucide-react'
import {
  OVERLAY_FONT_PRESETS,
  OVERLAY_WEIGHT_PRESETS,
  type ClipOverlay,
} from '@/modules/generator-ui/lib/overlays'

export interface OverlayEditorPopoverProps {
  overlays: ClipOverlay[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAddText: () => void
  onAddImage: (file: File) => void
  onUpdate: (id: string, patch: Partial<ClipOverlay>) => void
  onDelete: (id: string) => void
  triggerClassName?: string
}

export function OverlayEditorPopover(props: OverlayEditorPopoverProps) {
  const {
    overlays,
    selectedId,
    onSelect,
    onAddText,
    onAddImage,
    onUpdate,
    onDelete,
    triggerClassName,
  } = props
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const selected = overlays.find((o) => o.id === selectedId) ?? null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Edit overlays"
          title="Add text or image overlay"
          onClick={(e) => e.stopPropagation()}
          className={
            triggerClassName ??
            'inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/30 text-zinc-300 transition hover:bg-black/50 hover:text-white'
          }
        >
          <Type className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-80 border-white/10 bg-zinc-950/95 p-3 text-zinc-200 backdrop-blur"
        onClick={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => {
          // Allow drags inside the preview without closing
          e.preventDefault()
          setOpen(false)
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Overlays</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="secondary" className="h-7 px-2 text-xs"
              onClick={() => onAddText()}>
              <Plus className="mr-1 h-3 w-3" /> Text
            </Button>
            <Button size="sm" variant="secondary" className="h-7 px-2 text-xs"
              onClick={() => fileRef.current?.click()}>
              <ImageIcon className="mr-1 h-3 w-3" /> Image
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onAddImage(f)
                if (fileRef.current) fileRef.current.value = ''
              }}
            />
          </div>
        </div>

        {overlays.length === 0 ? (
          <p className="px-1 py-3 text-xs text-zinc-500">
            No overlays yet. Add text or an image to place it on this card and on the final film.
          </p>
        ) : (
          <ul className="mb-3 max-h-32 space-y-1 overflow-y-auto pr-1">
            {overlays.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onSelect(o.id)}
                  className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition ${
                    selectedId === o.id
                      ? 'border-white/30 bg-white/10'
                      : 'border-white/5 bg-white/[0.02] hover:bg-white/5'
                  }`}
                >
                  {o.kind === 'text' ? (
                    <Type className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  )}
                  <span className="flex-1 truncate">
                    {o.kind === 'text' ? (o.text_value || 'Untitled') : 'Image'}
                  </span>
                  <button
                    type="button"
                    aria-label="Delete overlay"
                    onClick={(e) => { e.stopPropagation(); onDelete(o.id) }}
                    className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-red-300"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && selected.kind === 'text' ? (
          <div className="space-y-2 border-t border-white/10 pt-2">
            <textarea
              value={selected.text_value ?? ''}
              onChange={(e) => onUpdate(selected.id, { text_value: e.target.value })}
              rows={2}
              className="w-full rounded-md border border-white/10 bg-white/[0.04] p-2 text-xs text-zinc-100 outline-none focus:border-white/30"
              placeholder="Text"
            />
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <label className="flex flex-col gap-1">
                <span className="text-zinc-400">Font</span>
                <select
                  value={selected.font_family ?? 'Inter'}
                  onChange={(e) => onUpdate(selected.id, { font_family: e.target.value })}
                  className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-1 text-xs text-zinc-100"
                  style={{ fontFamily: `"${selected.font_family ?? 'Inter'}", sans-serif` }}
                >
                  {Array.from(
                    OVERLAY_FONT_PRESETS.reduce((acc, f) => {
                      const list = acc.get(f.category) ?? []
                      list.push(f)
                      acc.set(f.category, list)
                      return acc
                    }, new Map<string, { id: string; label: string; category: string }[]>())
                  ).map(([category, fonts]) => (
                    <optgroup key={category} label={category}>
                      {fonts.map((f) => (
                        <option
                          key={f.id}
                          value={f.id}
                          style={{ fontFamily: `"${f.id}", sans-serif`, color: '#111' }}
                        >
                          {f.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-400">Weight</span>
                <select
                  value={selected.font_weight ?? 700}
                  onChange={(e) => onUpdate(selected.id, { font_weight: Number(e.target.value) })}
                  className="h-7 rounded-md border border-white/10 bg-white/[0.04] px-1 text-xs text-zinc-100"
                >
                  {OVERLAY_WEIGHT_PRESETS.map((w) => (
                    <option key={w.value} value={w.value}>{w.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-zinc-400">Color</span>
                <input
                  type="color"
                  value={selected.color ?? '#ffffff'}
                  onChange={(e) => onUpdate(selected.id, { color: e.target.value })}
                  className="h-7 w-full cursor-pointer rounded border border-white/10 bg-transparent"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="flex items-center justify-between text-zinc-400">
                  <span>Background</span>
                  <button
                    type="button"
                    onClick={() => onUpdate(selected.id, { bg_color: selected.bg_color ? null : '#000000' })}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300"
                  >
                    {selected.bg_color ? 'Off' : 'On'}
                  </button>
                </span>
                <input
                  type="color"
                  value={selected.bg_color ?? '#000000'}
                  disabled={!selected.bg_color}
                  onChange={(e) => onUpdate(selected.id, { bg_color: e.target.value })}
                  className="h-7 w-full cursor-pointer rounded border border-white/10 bg-transparent disabled:opacity-40"
                />
              </label>
            </div>
            <SizeRotation overlay={selected} onUpdate={onUpdate} />
          </div>
        ) : null}

        {selected && selected.kind === 'image' ? (
          <div className="space-y-2 border-t border-white/10 pt-2">
            <div className="flex items-center gap-2">
              <img src={selected.image_url ?? ''} alt="" className="h-12 w-12 rounded border border-white/10 object-contain" />
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs"
                onClick={() => fileRef.current?.click()}>
                Replace
              </Button>
            </div>
            <SizeRotation overlay={selected} onUpdate={onUpdate} />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function SizeRotation({
  overlay,
  onUpdate,
}: {
  overlay: ClipOverlay
  onUpdate: (id: string, patch: Partial<ClipOverlay>) => void
}) {
  return (
    <div className="space-y-2 text-[11px]">
      <label className="flex items-center gap-2">
        <span className="w-14 text-zinc-400">Size</span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.01}
          value={overlay.scale}
          onChange={(e) => onUpdate(overlay.id, { scale: Number(e.target.value) })}
          className="flex-1"
        />
        <span className="w-10 text-right text-zinc-500">{Math.round(overlay.scale * 100)}%</span>
      </label>
      <label className="flex items-center gap-2">
        <span className="w-14 text-zinc-400">Rotate</span>
        <input
          type="range"
          min={-180}
          max={180}
          step={1}
          value={overlay.rotation}
          onChange={(e) => onUpdate(overlay.id, { rotation: Number(e.target.value) })}
          className="flex-1"
        />
        <span className="w-10 text-right text-zinc-500">{Math.round(overlay.rotation)}°</span>
      </label>
    </div>
  )
}
