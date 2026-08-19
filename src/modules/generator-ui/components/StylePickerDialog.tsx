import { useEffect, useState, useMemo, useCallback } from 'react'
import { X, Search, Check, Film, Clapperboard, ImageIcon, Play } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { WizardStyleOption } from '@/modules/generator-ui/lib/promptStyles'
import { safeMediaUrl } from '@/modules/generator-ui/lib/safeMediaUrl'

export interface StylePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  icon?: 'camera' | 'theme'
  options: WizardStyleOption[]
  selectedValue: string
  onSelect: (value: string) => void
  onApply: () => void
}

type TabKey = 'all' | 'genre' | 'scene' | 'template'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'genre', label: 'Genre' },
  { key: 'scene', label: 'Scene' },
  { key: 'template', label: 'Template' },
]

export function StylePickerDialog({
  open,
  onOpenChange,
  title,
  icon = 'theme',
  options,
  selectedValue,
  onSelect,
  onApply,
}: StylePickerDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [pendingSelection, setPendingSelection] = useState<string>(selectedValue)
  const [previewingValue, setPreviewingValue] = useState<string | null>(null)
  const [failedPosters, setFailedPosters] = useState<Set<string>>(() => new Set())
  const [failedVideos, setFailedVideos] = useState<Set<string>>(() => new Set())

  // Reset pending selection when dialog opens
  useEffect(() => {
    if (open) {
      setPendingSelection(selectedValue)
      setSearchQuery('')
      setActiveTab('all')
      setPreviewingValue(null)
      setFailedPosters(new Set())
      setFailedVideos(new Set())
    } else {
      setPreviewingValue(null)
    }
  }, [open, selectedValue])

  // Filter options by search query and tab
  const filteredOptions = useMemo(() => {
    let result = options

    // Filter by tab - only show tabs when there are themed options
    if (activeTab === 'genre') {
      result = result.filter((opt) => opt.group === 'Genre & atmosphere')
    } else if (activeTab === 'scene') {
      result = result.filter((opt) => opt.group?.startsWith('Scene'))
    } else if (activeTab === 'template') {
      result = result.filter((opt) => opt.group?.startsWith('Template'))
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (opt) =>
          opt.label.toLowerCase().includes(q) ||
          opt.prompt.toLowerCase().includes(q) ||
          opt.group?.toLowerCase().includes(q),
      )
    }

    return result
  }, [options, activeTab, searchQuery])

  // Check if we should show tabs (only if there are themed options beyond genre)
  const hasThemedOptions = useMemo(() => {
    return options.some((opt) => opt.group && !['Genre & atmosphere'].includes(opt.group))
  }, [options])

  // Group options for display
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, WizardStyleOption[]>()
    
    for (const opt of filteredOptions) {
      const groupKey = opt.group ?? 'Other'
      if (!groups.has(groupKey)) {
        groups.set(groupKey, [])
      }
      groups.get(groupKey)!.push(opt)
    }

    return groups
  }, [filteredOptions])

  const handleApply = useCallback(() => {
    setPreviewingValue(null)
    onSelect(pendingSelection)
    onApply()
    onOpenChange(false)
  }, [pendingSelection, onSelect, onApply, onOpenChange])

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setPreviewingValue(null)
        onOpenChange(false)
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleApply()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleApply, onOpenChange])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) setPreviewingValue(null)
    onOpenChange(nextOpen)
  }, [onOpenChange])

  function renderFallback(option: WizardStyleOption) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900"
        data-testid={`media-fallback-${option.value}`}
      >
        {icon === 'camera' ? (
          <Clapperboard className="h-6 w-6 text-zinc-500" aria-hidden="true" />
        ) : (
          <Film className="h-6 w-6 text-zinc-500" aria-hidden="true" />
        )}
      </div>
    )
  }

  function renderPoster(option: WizardStyleOption) {
    const posterUrl = safeMediaUrl(option.posterUrl)
    if (!posterUrl || failedPosters.has(option.value)) return renderFallback(option)

    return (
      <img
        src={posterUrl}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        onError={() => {
          setFailedPosters((current) => new Set(current).add(option.value))
        }}
      />
    )
  }

  const showTabs = hasThemedOptions

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-4xl border-white/10 bg-zinc-950/95 text-zinc-100 flex flex-col p-0 gap-0 sm:w-full">
        {/* Header */}
        <DialogHeader className="px-4 pt-5 pb-4 border-b border-white/10 flex-shrink-0 sm:px-6 sm:pt-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg flex items-center gap-2">
              {icon === 'camera' ? (
                <Clapperboard className="h-5 w-5 text-fuchsia-300" />
              ) : (
                <Film className="h-5 w-5 text-fuchsia-300" />
              )}
              {title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Search the available styles, choose one option, and apply it to the film.
            </DialogDescription>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
              className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-100"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Search and Tabs */}
        <div className="px-4 py-4 border-b border-white/10 space-y-3 flex-shrink-0 sm:px-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setPreviewingValue(null)
                setSearchQuery(e.target.value)
              }}
              placeholder="Search styles..."
              className="pl-9 border-white/10 bg-white/[0.03] text-sm text-zinc-100"
            />
          </div>
          
          {showTabs && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {TABS.map((tab) => (
                <Button
                  key={tab.key}
                  type="button"
                  variant={activeTab === tab.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setPreviewingValue(null)
                    setActiveTab(tab.key)
                  }}
                  className={`h-7 text-xs ${
                    activeTab === tab.key
                      ? 'bg-fuchsia-500/90 text-white hover:bg-fuchsia-500'
                      : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'
                  }`}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Options Grid */}
        <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 sm:px-6">
          {groupedOptions.size === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
              <ImageIcon className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">No styles found{searchQuery ? ` for "${searchQuery}"` : ''}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Array.from(groupedOptions.entries()).map(([groupName, groupOptions]) => (
                <div key={groupName}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
                    {groupName}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {groupOptions.map((opt) => {
                      const isSelected = pendingSelection === opt.value
                      const videoUrl = safeMediaUrl(opt.videoUrl)
                      const isPreviewing = previewingValue === opt.value && Boolean(videoUrl) && !failedVideos.has(opt.value)
                      return (
                        <div
                          key={opt.value}
                          className={`group relative overflow-hidden rounded-lg border transition-all ${
                            isSelected
                              ? 'border-fuchsia-400 ring-2 ring-fuchsia-400/30'
                              : 'border-white/10 hover:border-white/30'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewingValue(null)
                              setPendingSelection(opt.value)
                            }}
                            aria-pressed={isSelected}
                            aria-label={`Select ${opt.label}`}
                            className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fuchsia-400"
                          >
                            <div className="aspect-video bg-zinc-900">
                              {isPreviewing ? (
                                <video
                                  key={opt.value}
                                  src={videoUrl}
                                  poster={safeMediaUrl(opt.posterUrl) || undefined}
                                  aria-label={`${opt.label} video preview`}
                                  className="h-full w-full object-cover"
                                  autoPlay
                                  muted
                                  loop
                                  playsInline
                                  preload="metadata"
                                  onError={() => {
                                    setFailedVideos((current) => new Set(current).add(opt.value))
                                    setPreviewingValue(null)
                                  }}
                                />
                              ) : renderPoster(opt)}
                            </div>

                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2 pb-1.5 pt-6 text-left">
                              <span className="text-[11px] font-medium text-white line-clamp-2 leading-tight">
                                {opt.label}
                              </span>
                            </div>
                          </button>

                          {videoUrl && !failedVideos.has(opt.value) && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => setPreviewingValue(isPreviewing ? null : opt.value)}
                              aria-label={isPreviewing ? `Close ${opt.label} preview` : `Preview ${opt.label}`}
                              className="absolute left-1.5 top-1.5 h-7 gap-1 bg-black/70 px-2 text-[10px] text-white hover:bg-black/85"
                            >
                              {isPreviewing ? <X className="h-3 w-3" /> : <Play className="h-3 w-3 fill-current" />}
                              {isPreviewing ? 'Close' : 'Preview'}
                            </Button>
                          )}

                          {isSelected && (
                            <div className="pointer-events-none absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-fuchsia-500 flex items-center justify-center" aria-hidden="true">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with None, Cancel, Apply */}
        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3 flex-shrink-0 sm:px-6 sm:py-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setPreviewingValue(null)
              setPendingSelection('auto')
            }}
            className={`h-9 text-xs ${
              pendingSelection === 'auto'
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]'
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
            None (Auto)
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
              className="h-9 px-4 text-xs text-zinc-300 hover:text-zinc-100"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              className="h-9 px-4 text-xs bg-fuchsia-500/90 text-white hover:bg-fuchsia-500"
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Apply
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default StylePickerDialog
