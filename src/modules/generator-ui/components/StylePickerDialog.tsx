import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clapperboard, ImageOff, Search, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { safeMediaUrl } from '@/modules/generator-ui/lib/safeMediaUrl'

/**
 * A single selectable option inside the picker. `preview` is the raw preview
 * URL — an MP4 clip for most styles, an image for others. The picker decides
 * how to render the preview based on the URL's file type.
 */
export interface StylePickerOption {
  value: string
  label: string
  /** Raw preview URL — may be an MP4 clip or an image. */
  preview?: string
  /** Optional subgroup label (e.g. "Genre & atmosphere", "Scene · …"). */
  group?: string
}

export interface StylePickerTab {
  /** Stable tab id. */
  id: string
  /** Short tab label shown in the tab bar. */
  label: string
  /** Options shown under this tab. */
  options: StylePickerOption[]
}

export interface StylePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** The currently committed value (shown as selected; unchanged until Apply). */
  value: string
  /** The "None" option value (e.g. 'auto'). */
  noneValue: string
  noneLabel?: string
  /** Flat list of all options (used for the camera picker and the search). */
  options: StylePickerOption[]
  /** Optional tabbed layout (used for the visual theme picker). */
  tabs?: StylePickerTab[]
  /** Called with the newly committed value when the user presses Apply. */
  onApply: (value: string) => void
}

function isVideoUrl(url: string | undefined): boolean {
  if (!url) return false
  const clean = url.split('?')[0].toLowerCase()
  return /\.(mp4|webm|ogg|mov|m4v)(\/|$)/.test(clean) || /\/__l5e\/assets-v1\//.test(url)
}

/**
 * Renders a single preview: an MP4 clip as a muted looping <video>, an image
 * as an <img>, and a fallback placeholder when the URL is missing, unsafe or
 * fails to load. Broken/missing media never shows a broken image icon.
 */
function StylePreview({ url, label }: { url?: string; label: string }) {
  const [failed, setFailed] = useState(false)
  const safe = safeMediaUrl(url)
  const showFallback = !safe || failed

  useEffect(() => {
    setFailed(false)
  }, [url])

  if (showFallback) {
    return (
      <div className="grid aspect-video w-full place-items-center rounded-md bg-black/40 text-zinc-600">
        <ImageOff className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">No preview for {label}</span>
      </div>
    )
  }

  if (isVideoUrl(safe)) {
    return (
      <video
        src={safe}
        muted
        loop
        playsInline
        preload="metadata"
        onError={() => setFailed(true)}
        className="aspect-video w-full rounded-md bg-black object-cover"
      />
    )
  }

  return (
    <img
      src={safe}
      alt={label}
      loading="lazy"
      onError={() => setFailed(true)}
      className="aspect-video w-full rounded-md bg-black object-cover"
    />
  )
}

/**
 * A modal, grid-based style picker that replaces the old Radix Select dropdowns
 * for the Make Full Film wizard's Camera angle and Visual theme fields.
 *
 * - Options are shown as a responsive grid of cards with a name and a preview
 *   (MP4 clips play as video, images render as images, broken/missing media
 *   shows a fallback).
 * - The Visual theme picker splits options into tabs (Genre / Scene / Video
 *   templates) plus a search box that filters across all tabs.
 * - A "None" option is always available.
 * - The committed value is only changed when the user presses Apply; Cancel or
 *   Escape leaves the previous selection untouched.
 * - Desktop: bounded, scrollable panel. Mobile: near-fullscreen.
 * - Keyboard accessible: Escape closes, focus returns to the trigger.
 */
export function StylePickerDialog({
  open,
  onOpenChange,
  title,
  description,
  value,
  noneValue,
  noneLabel = 'None',
  options,
  tabs,
  onApply,
}: StylePickerDialogProps) {
  const [draft, setDraft] = useState<string>(value)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<string>(tabs?.[0]?.id ?? 'all')
  const triggerRef = useRef<HTMLElement | null>(null)

  // Reset the draft to the committed value each time the dialog opens, so the
  // previous selection is never changed until Apply.
  useEffect(() => {
    if (open) {
      setDraft(value)
      setQuery('')
      setActiveTab(tabs?.[0]?.id ?? 'all')
      // Remember the element that opened the dialog so focus can return to it.
      triggerRef.current = document.activeElement as HTMLElement | null
    }
  }, [open, value, tabs])

  const normalizedQuery = query.trim().toLowerCase()

  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options
    return options.filter((o) => o.label.toLowerCase().includes(normalizedQuery))
  }, [options, normalizedQuery])

  const filteredTabs = useMemo(() => {
    if (!tabs) return undefined
    if (!normalizedQuery) return tabs
    return tabs
      .map((t) => ({ ...t, options: t.options.filter((o) => o.label.toLowerCase().includes(normalizedQuery)) }))
      .filter((t) => t.options.length > 0)
  }, [tabs, normalizedQuery])

  const handleClose = (openNext: boolean) => {
    if (!openNext) {
      // Restore focus to the trigger that opened the picker.
      requestAnimationFrame(() => triggerRef.current?.focus?.())
    }
    onOpenChange(openNext)
  }

  const handleApply = () => {
    onApply(draft)
    handleClose(false)
  }

  const renderOptionCard = (opt: StylePickerOption) => {
    const selected = draft === opt.value
    return (
      <button
        key={opt.value}
        type="button"
        onClick={() => setDraft(opt.value)}
        aria-pressed={selected}
        className={cn(
          'group relative flex flex-col overflow-hidden rounded-md border text-left transition',
          selected
            ? 'border-fuchsia-300/70 bg-fuchsia-500/10 ring-1 ring-fuchsia-300/50'
            : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]',
        )}
      >
        <div className="relative">
          <StylePreview url={opt.preview} label={opt.label} />
          {selected && (
            <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-fuchsia-500 text-white">
              <Check className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Selected</span>
            </span>
          )}
        </div>
        <div className="truncate px-2 py-1.5 text-[11px] leading-tight text-zinc-200">
          {opt.label}
        </div>
      </button>
    )
  }

  const renderGrid = (list: StylePickerOption[]) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {list.map(renderOptionCard)}
    </div>
  )

  const showTabs = Boolean(filteredTabs && filteredTabs.length > 0)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          'flex max-h-[92vh] w-full flex-col gap-0 border-white/10 bg-zinc-950/95 p-0 text-zinc-100 sm:max-w-3xl',
          // Mobile: near-fullscreen. Desktop: bounded.
          'max-w-[100vw] sm:max-w-3xl',
        )}
      >
        <DialogHeader className="flex-shrink-0 border-b border-white/10 px-4 py-3 sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-base text-zinc-100">
            <Clapperboard className="h-5 w-5 text-fuchsia-300" aria-hidden="true" />
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-xs text-zinc-400">{description}</DialogDescription>
          )}
        </DialogHeader>

        {/* Search */}
        <div className="flex-shrink-0 px-4 pt-3 sm:px-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search styles…"
              aria-label="Search styles"
              className="h-9 border-white/10 bg-white/[0.03] pl-8 text-sm text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
        </div>

        {/* Tabs (theme only) */}
        {showTabs && (
          <div className="flex-shrink-0 px-4 pt-3 sm:px-5">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-white/[0.03] p-1">
                {filteredTabs!.map((t) => (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    className="h-7 px-2.5 text-[11px] data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-100"
                  >
                    {t.label}
                    <span className="ml-1 text-[10px] opacity-60">{t.options.length}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}

        {/* Scrollable option area */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {/* None option */}
          <button
            type="button"
            onClick={() => setDraft(noneValue)}
            aria-pressed={draft === noneValue}
            className={cn(
              'mb-3 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition',
              draft === noneValue
                ? 'border-fuchsia-300/70 bg-fuchsia-500/10 text-fuchsia-100'
                : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]',
            )}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {noneLabel}
            {draft === noneValue && <Check className="ml-auto h-3.5 w-3.5" aria-hidden="true" />}
          </button>

          {normalizedQuery ? (
            filteredOptions.length > 0 ? (
              renderGrid(filteredOptions)
            ) : (
              <div className="py-10 text-center text-sm text-zinc-500">No styles match “{query}”.</div>
            )
          ) : showTabs ? (
            filteredTabs!.map((t) =>
              t.id === activeTab ? (
                <div key={t.id}>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    {t.label}
                  </div>
                  {renderGrid(t.options)}
                </div>
              ) : null,
            )
          ) : (
            renderGrid(options)
          )}
        </div>

        {/* Footer: Cancel / Apply */}
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-white/10 px-4 py-3 sm:px-5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleClose(false)}
            className="text-zinc-300 hover:text-zinc-100"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            className="gap-1.5 bg-fuchsia-500/90 text-white hover:bg-fuchsia-500"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default StylePickerDialog
