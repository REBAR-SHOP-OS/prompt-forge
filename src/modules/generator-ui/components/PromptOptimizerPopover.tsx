import { useEffect, useState } from 'react'
import { ChevronDown, LoaderCircle, Mic, MicOff, Sparkles, Wand2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { StylePreviewCard } from '@/modules/generator-ui/components/StylePreviewCard'
import {
  CAMERA_STYLES,
  GENRE_STYLES,
  SCENE_GROUP_ORDER,
  SCENE_STYLES,
  TEMPLATE_GROUP_ORDER,
  TEMPLATE_STYLES,
  buildStyleHints,
  countSelectedStyles,
  emptyStyleSelection,
  type StyleItem,
  type StyleSelection,
} from '@/modules/generator-ui/lib/promptStyles'

export type PromptOptimizationRequest = {
  prompt: string
  withNarration: boolean
  narratorScript?: string
  styleHints?: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPrompt: string
  disabled?: boolean
  optimizing?: boolean
  onOptimize: (request: PromptOptimizationRequest) => void | Promise<void>
}

function StyleSection({
  title,
  items,
  selectedIds,
  onToggle,
}: {
  title: string
  items: StyleItem[]
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const active = selectedIds.includes(item.id)
          return (
            <StylePreviewCard
              key={item.id}
              title={item.label}
              description={item.prompt}
              preview={item.preview}
              selected={active}
              onSelect={() => onToggle(item.id)}
            >
              <button
                type="button"
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
                  active
                    ? 'border-amber-300 bg-accent-warm/15 text-accent-warm'
                    : 'border-border bg-accent/30 text-foreground/80 hover:bg-accent/60'
                }`}
              >
                <span aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            </StylePreviewCard>
          )
        })}
      </div>
    </div>
  )
}

export function PromptOptimizerPopover({
  open,
  onOpenChange,
  initialPrompt,
  disabled = false,
  optimizing = false,
  onOptimize,
}: Props) {
  const [draftPrompt, setDraftPrompt] = useState(initialPrompt)
  const [withNarration, setWithNarration] = useState(false)
  const [narratorScript, setNarratorScript] = useState('')
  const [stylesOpen, setStylesOpen] = useState(false)
  const [selectedStyles, setSelectedStyles] = useState<StyleSelection>(emptyStyleSelection)
  const selectedStyleCount = countSelectedStyles(selectedStyles)

  useEffect(() => {
    if (!open) return
    setDraftPrompt(initialPrompt)
    setWithNarration(false)
    setNarratorScript('')
    setStylesOpen(false)
    setSelectedStyles(emptyStyleSelection())
  }, [initialPrompt, open])

  const toggleStyle = (kind: keyof StyleSelection, id: string) => {
    setSelectedStyles((current) => ({
      ...current,
      [kind]: current[kind].includes(id)
        ? current[kind].filter((selectedId) => selectedId !== id)
        : [...current[kind], id],
    }))
  }

  const canOptimize =
    draftPrompt.trim().length > 0 &&
    (!withNarration || narratorScript.trim().length > 0) &&
    !disabled &&
    !optimizing

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || optimizing}
          aria-label="Enhance prompt with AI"
          className="inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-full border border-border bg-muted/60 px-4 text-sm font-semibold text-foreground/80 transition hover:border-accent-warm/60 hover:bg-accent/50 hover:text-accent-warm disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-muted/60 disabled:hover:text-foreground/80"
        >
          {optimizing ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          Prompt
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        aria-label="Prompt optimizer"
        className="w-[min(28rem,calc(100vw-2rem))] space-y-4 border-border bg-card p-4 text-foreground/90 shadow-[0_22px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Optimize prompt</h2>
          <p className="text-xs leading-5 text-muted-foreground">
            Refine your idea, choose narration, and optionally add a visual style.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="optimizer-prompt" className="text-xs font-medium text-muted-foreground">
            Prompt
          </label>
          <textarea
            id="optimizer-prompt"
            autoFocus
            value={draftPrompt}
            onChange={(event) => setDraftPrompt(event.target.value)}
            rows={4}
            placeholder="Describe the video you want to create…"
            className="w-full resize-y rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-accent-warm/50"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">Narration</legend>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={withNarration}
              onClick={() => setWithNarration(true)}
              className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
                withNarration
                  ? 'border-amber-300 bg-accent-warm/15 text-accent-warm'
                  : 'border-border bg-accent/30 text-foreground/80 hover:bg-accent/60'
              }`}
            >
              <Mic className="h-3.5 w-3.5" aria-hidden="true" />
              With narration
            </button>
            <button
              type="button"
              aria-pressed={!withNarration}
              onClick={() => {
                setWithNarration(false)
                setNarratorScript('')
              }}
              className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
                !withNarration
                  ? 'border-amber-300 bg-accent-warm/15 text-accent-warm'
                  : 'border-border bg-accent/30 text-foreground/80 hover:bg-accent/60'
              }`}
            >
              <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
              Without narration
            </button>
          </div>
        </fieldset>

        {withNarration ? (
          <div className="space-y-1.5">
            <label htmlFor="optimizer-narration" className="text-xs font-medium text-muted-foreground">
              Narration text
            </label>
            <textarea
              id="optimizer-narration"
              value={narratorScript}
              onChange={(event) => setNarratorScript(event.target.value)}
              rows={3}
              maxLength={1500}
              placeholder="Type the exact words the narrator should say…"
              className="w-full resize-y rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-accent-warm/50"
            />
            <p className="text-right text-[10px] text-muted-foreground">{narratorScript.length}/1500</p>
          </div>
        ) : null}

        <div className="rounded-lg border border-border bg-accent/20">
          <button
            type="button"
            aria-expanded={stylesOpen}
            onClick={() => setStylesOpen((current) => !current)}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-accent-warm/30 bg-accent-warm/10 text-accent-warm">
              <Wand2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                Styles
                {selectedStyleCount > 0 ? (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-300 px-1 text-[10px] font-bold text-zinc-950">
                    {selectedStyleCount}
                  </span>
                ) : null}
              </span>
              <span className="block text-xs leading-5 text-muted-foreground">Optional camera, genre, scene, and template direction.</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition ${stylesOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>

          {stylesOpen ? (
            <div className="space-y-3 border-t border-border px-3 py-3">
              <div className="max-h-[38vh] space-y-3 overflow-y-auto pr-1">
                <StyleSection title="Camera style" items={CAMERA_STYLES} selectedIds={selectedStyles.camera} onToggle={(id) => toggleStyle('camera', id)} />
                <StyleSection title="Genre & atmosphere" items={GENRE_STYLES} selectedIds={selectedStyles.genre} onToggle={(id) => toggleStyle('genre', id)} />
                {SCENE_GROUP_ORDER.map((group) => (
                  <StyleSection key={group} title={`Scene · ${group}`} items={SCENE_STYLES.filter((style) => style.group === group)} selectedIds={selectedStyles.scene} onToggle={(id) => toggleStyle('scene', id)} />
                ))}
                {TEMPLATE_GROUP_ORDER.map((group) => (
                  <StyleSection key={group} title={`Template · ${group}`} items={TEMPLATE_STYLES.filter((style) => style.group === group)} selectedIds={selectedStyles.template} onToggle={(id) => toggleStyle('template', id)} />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSelectedStyles(emptyStyleSelection())}
                disabled={selectedStyleCount === 0 || optimizing}
                className="text-[11px] text-muted-foreground transition hover:text-foreground/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear styles
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void onOptimize({
            prompt: draftPrompt.trim(),
            withNarration,
            ...(withNarration ? { narratorScript: narratorScript.trim() } : {}),
            styleHints: buildStyleHints(selectedStyles),
          })}
          disabled={!canOptimize}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-amber-300 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {optimizing ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
          Optimize prompt
        </button>
      </PopoverContent>
    </Popover>
  )
}
