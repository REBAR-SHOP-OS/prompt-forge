import type { ReactNode } from 'react'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'

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
}

/**
 * Wraps a style chip and shows a small hover card with a looping, muted
 * preview clip (when available) plus the style name and a short description.
 * Falls back to a text-only card when no preview clip exists yet.
 *
 * On touch devices HoverCard opens on tap, so this works on mobile too.
 */
export function StylePreviewCard({ children, title, description, preview, rtl }: Props) {
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="center"
        className="w-64 border-white/10 bg-zinc-900/95 p-2 text-zinc-100 shadow-xl"
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
        <div className="text-xs font-semibold text-zinc-100">{title}</div>
        {description ? (
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{description}</p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  )
}

export default StylePreviewCard
