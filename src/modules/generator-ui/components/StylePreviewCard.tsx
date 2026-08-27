import { useState, type ReactNode } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type Props = {
  /** The trigger element (the style chip/button). */
  children: ReactNode
  /** Display name of the style. */
  title: string
  /** Short description of what the style looks like. */
  description?: string
  /** Optional looping preview clip URL. When present a muted video is shown. */
  preview?: string
  /** Disable RTL-aware alignment when needed. */
  rtl?: boolean
  /** Runs the actual selection logic when the user presses the select button. */
  onSelect?: () => void
  /** Whether this style is currently selected (controls the button label). */
  selected?: boolean
  /** Label for the select button when not selected. */
  selectLabel?: string
  /** Label for the select button when already selected. */
  selectedLabel?: string
}

/**
 * Wraps a style chip. Clicking the chip opens a popover showing a looping,
 * muted preview clip (when available) plus the style name and a short
 * description. Selection happens only via the explicit button inside the
 * popover — clicking the chip itself never selects the style.
 *
 * Works on touch devices too, since it is click/tap based.
 */
export function StylePreviewCard({
  children,
  title,
  description,
  preview,
  rtl,
  onSelect,
  selected,
  selectLabel,
  selectedLabel,
}: Props) {
  const [open, setOpen] = useState(false)

  const handleSelect = () => {
    onSelect?.()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="w-64 border-border bg-card p-2 text-foreground shadow-xl"
        dir={rtl ? 'rtl' : undefined}
      >
        {preview ? (
          <video
            src={preview}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="mb-2 aspect-video w-full rounded-md bg-black object-cover"
          />
        ) : null}
        <div className="text-xs font-semibold text-foreground">{title}</div>
        {description ? (
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        {onSelect ? (
          <button
            type="button"
            onClick={handleSelect}
            className={`mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
              selected
                ? 'border-accent-warm/60 bg-accent-warm/15 text-accent-warm hover:bg-accent-warm/25'
                : 'border-border bg-accent/60 text-foreground hover:bg-accent'
            }`}
          >
            {selected ? (selectedLabel ?? 'Selected ✓') : (selectLabel ?? 'Select')}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export default StylePreviewCard
