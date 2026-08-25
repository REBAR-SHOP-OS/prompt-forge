import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, RotateCcw, Sparkles } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { TransitionPreview } from '@/modules/generator-ui/components/TransitionPreview'
import type { TransitionId, TransitionSpec } from '@/modules/generator-ui/lib/mergeVideos'
import {
  TRANSITION_GROUPS,
  TRANSITION_LABEL,
  DURATION_PRESETS,
  DEFAULT_TRANSITION_DURATION,
  MIN_TRANSITION_MS,
  MAX_TRANSITION_MS,
  clampTransitionDuration,
  transitionSpecFor,
} from '@/modules/generator-ui/lib/transitions'

type Props = {
  value: TransitionId
  durationMs: number
  gapCount: number
  onSelect: (spec: TransitionSpec) => void
  onApplyToAll: (spec: TransitionSpec) => void
  onReset: () => void
}

/**
 * Professional transition picker: a Popover panel with grouped, animated
 * transition cards, a duration control (safe engine range + presets),
 * "Apply to all", and "Reset to Cut". Reuses TransitionPreview for the
 * animated A/B thumbnails — no new render engine.
 */
export function TransitionPicker({
  value,
  durationMs,
  gapCount,
  onSelect,
  onApplyToAll,
  onReset,
}: Props) {
  const [open, setOpen] = useState(false)
  const [draftMs, setDraftMs] = useState(durationMs)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Keep the duration slider in sync when the popover opens for a new gap.
  useEffect(() => {
    if (open) setDraftMs(durationMs)
  }, [open, durationMs])

  const commit = useCallback(
    (id: TransitionId, ms: number) => {
      onSelect(transitionSpecFor(id, ms))
    },
    [onSelect],
  )

  const commitAll = useCallback(
    (id: TransitionId, ms: number) => {
      onApplyToAll(transitionSpecFor(id, ms))
    },
    [onApplyToAll],
  )

  const durationForSelection = useCallback(
    (id: TransitionId) => id === value ? draftMs : DEFAULT_TRANSITION_DURATION[id],
    [draftMs, value],
  )

  const selectTransition = useCallback(
    (id: TransitionId) => {
      const ms = durationForSelection(id)
      setDraftMs(ms)
      commit(id, ms)
    },
    [commit, durationForSelection],
  )

  // Roving focus across the transition cards via arrow keys.
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(event.key)) return
      const cards = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>('[data-transition-card]') ?? [],
      )
      if (cards.length === 0) return
      const idx = cards.indexOf(document.activeElement as HTMLElement)
      const next =
        event.key === 'ArrowDown' || event.key === 'ArrowRight'
          ? (idx + 1) % cards.length
          : (idx - 1 + cards.length) % cards.length
      event.preventDefault()
      cards[next]?.focus()
    },
    [],
  )

  const isCut = value === 'cut'
  const effectiveMs = isCut ? 0 : clampTransitionDuration(durationMs)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/95 px-2.5 py-1 text-[11px] font-medium text-foreground/80 transition hover:border-border hover:text-foreground"
          title="Transition between these clips"
          aria-label={`Transition: ${TRANSITION_LABEL[value]}`}
        >
          <TransitionPreview id={value} size={22} />
          <span>{TRANSITION_LABEL[value]}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        sideOffset={8}
        className="w-[19rem] max-w-[calc(100vw-2rem)] p-0"
        onKeyDown={handleKeyDown}
      >
        <div className="max-h-[70vh] overflow-y-auto p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Transition
            </span>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      onReset()
                      setDraftMs(0)
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:bg-accent/60 hover:text-foreground"
                    aria-label="Reset to Cut"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    Reset to Cut
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Set this gap back to a plain Cut</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div ref={listRef} className="space-y-3">
            {TRANSITION_GROUPS.map((group) => (
              <div key={group.group}>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.group}
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {group.items.map((opt) => {
                    const selected = opt.id === value
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-transition-card
                        tabIndex={0}
                        onClick={() => selectTransition(opt.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            selectTransition(opt.id)
                          }
                        }}
                        aria-pressed={selected}
                        className={`flex items-center gap-3 rounded-lg border p-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/50 ${
                          selected
                            ? 'border-sky-300/50 bg-sky-300/[0.08] shadow-[0_0_0_1px_rgba(125,211,252,0.25)]'
                            : 'border-border bg-accent/20 hover:border-border hover:bg-accent/50'
                        }`}
                      >
                        <TransitionPreview id={opt.id} size={40} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                            {opt.label}
                            {selected && (
                              <Check className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
                            )}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                            {opt.description}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {!isCut && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">Duration</span>
                <span className="tabular-nums text-[11px] font-semibold text-foreground/90">
                  {clampTransitionDuration(draftMs)} ms
                </span>
              </div>
              <Slider
                value={[clampTransitionDuration(draftMs)]}
                min={MIN_TRANSITION_MS}
                max={MAX_TRANSITION_MS}
                step={50}
                onValueChange={(v) => {
                  const ms = v[0] ?? 500
                  setDraftMs(ms)
                  commit(value, ms)
                }}
                aria-label="Transition duration"
              />
              <div className="mt-2 flex items-center gap-1.5">
                {DURATION_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setDraftMs(p.ms)
                      commit(value, p.ms)
                    }}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                      clampTransitionDuration(draftMs) === p.ms
                        ? 'border-sky-300/50 bg-sky-300/10 text-accent-cool'
                        : 'border-border bg-accent/20 text-muted-foreground hover:border-border hover:text-foreground/90'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {gapCount > 1 && (
            <button
              type="button"
              onClick={() => commitAll(value, draftMs)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-accent/30 px-3 py-2 text-xs font-medium text-foreground/90 transition hover:border-sky-300/40 hover:bg-sky-300/10 hover:text-sky-100"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Apply to all ({gapCount} gaps)
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
