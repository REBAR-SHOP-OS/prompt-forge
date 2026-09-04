import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, Church, Clapperboard, Globe2, Languages, Leaf, LoaderCircle, RefreshCw, Wand2 } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'
import { request } from '@/core/api/client'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  getOccasionsForDate,
  getOccasionsForMonth,
  toDateKey,
  type DatedOccasion,
  type OccasionCategory,
} from '@/modules/generator-ui/lib/occasions'

interface CalendarInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApplyPrompt?: (prompt: string) => void
  todayOnly?: boolean
}

type Category = OccasionCategory

// WHICH occasions exist, and WHEN, is decided locally by
// `lib/occasions.ts` - deterministic, instant, and identical for the day
// panel and the month panel. The `day-info` edge function is now only asked
// for PROSE about an occasion the client already picked. It is never asked
// what day something falls on.
type Occasion = DatedOccasion
type MonthOccasion = DatedOccasion

interface OccasionDetail {
  whatItIs: string
  history: string
}

const fmt = (d: Date) => toDateKey(d)
const fmtMonth = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

const labels = {
  en: {
    whatItIs: 'About', history: 'History',
    empty: 'No major holiday on this day.',
    loading: 'Loading occasions…',
    pick: 'Pick a date to see occasions.',
    monthTitle: 'This month',
    monthEmpty: 'No major occasions this month.',
    canada: 'Canada', international: 'International', religious: 'Religious',
    scenarioTitle: 'Scenario',
    pickOccasion: 'Click an occasion to generate a 10-second cinematic scenario.',
    generating: 'Writing scenario…',
    regenerate: 'Regenerate',
    useInPrompt: 'Use in prompt',
    badge10s: '10s',
    scenarioError: 'Could not generate scenario.',
  },

}

const ALL_CATEGORIES: Category[] = ['canada', 'international', 'religious']

export default function CalendarInfoDialog({ open, onOpenChange, onApplyPrompt, todayOnly = false }: CalendarInfoDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => new Date())
  const [lang, setLang] = useState<'en'>('en')
  const [detailCache, setDetailCache] = useState<Record<string, OccasionDetail>>({})
  const [detailLoadingKey, setDetailLoadingKey] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [activeFilters, setActiveFilters] = useState<Set<Category>>(() => new Set(ALL_CATEGORIES))
  const [selectedOccasion, setSelectedOccasion] = useState<Occasion | null>(null)
  const [scenarioCache, setScenarioCache] = useState<Record<string, string>>({})
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const { toast } = useToast()

  const dateKey = useMemo(() => fmt(selectedDate), [selectedDate])
  const monthKey = useMemo(() => fmtMonth(visibleMonth), [visibleMonth])
  // Cache keys bumped (day v2 -> v3, month v1 -> v2) so anything persisted
  // from the LLM-dated era is not read back.
  const dayCacheKey = `v3:${dateKey}:${lang}`
  const monthCacheKey = `v2:${monthKey}:${lang}`

  // Deterministic, synchronous, no network. Both panels read one source.
  const occasions = useMemo<Occasion[]>(() => getOccasionsForDate(selectedDate), [selectedDate])
  const monthOccasions = useMemo<MonthOccasion[]>(
    () => getOccasionsForMonth(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1),
    [visibleMonth],
  )
  const t = labels[lang]
  useEffect(() => {
    setExpandedIndex(null)
  }, [dayCacheKey])

  // When dialog opens in "today only" mode, snap to today.
  useEffect(() => {
    if (open && todayOnly) {
      const today = new Date()
      setSelectedDate(today)
      setVisibleMonth(today)
      setSelectedOccasion(null)
    }
  }, [open, todayOnly])


  const detailKey = (occ: Occasion) => `v3:${occ.date}:${occ.title}:${lang}`

  // Prose only. The occasion and its date are already known and were never
  // asked of a model, so there is nothing here that can drift by a day.
  const loadDetail = async (occ: Occasion) => {
    const key = detailKey(occ)
    if (detailCache[key] || detailLoadingKey === key) return
    setDetailLoadingKey(key)
    setDetailError(null)
    try {
      const data = await request<{ occasion?: OccasionDetail }>('/day-info', {
        method: 'POST',
        body: JSON.stringify({ occasion: { title: occ.title, date: occ.date, category: occ.category }, lang }),
      })
      const detail = data.occasion
      setDetailCache((c) => ({
        ...c,
        [key]: {
          whatItIs: detail?.whatItIs?.trim() || '',
          history: detail?.history?.trim() || '',
        },
      }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load occasion detail'
      setDetailError(msg)
      toast({ title: 'Could not load occasion detail', description: msg, variant: 'destructive' })
    } finally {
      setDetailLoadingKey((k) => (k === key ? null : k))
    }
  }

  // (The month list is derived above, synchronously, from the same source as
  // the day list. There is no month fetch any more.)

  const longLabel = useMemo(
    () => selectedDate.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
    [selectedDate],
  )

  const monthLabel = useMemo(
    () => visibleMonth.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long',
    }),
    [visibleMonth],
  )

  const filteredMonthOccasions = useMemo(() => {
    if (!monthOccasions) return null
    return monthOccasions
      .filter((o) => activeFilters.has(o.category))
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [monthOccasions, activeFilters])

  const toggleFilter = (cat: Category) => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      // Don't allow zero filters — re-enable all if user turns off the last one
      if (next.size === 0) return new Set(ALL_CATEGORIES)
      return next
    })
  }

  const filterIcons: Array<{ cat: Category; Icon: typeof Leaf; label: string }> = [
    { cat: 'canada', Icon: Leaf, label: t.canada },
    { cat: 'international', Icon: Globe2, label: t.international },
    { cat: 'religious', Icon: Church, label: t.religious },
  ]

  const handleMonthOccasionClick = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    if (!y || !m || !d) return
    const dt = new Date(y, m - 1, d)
    setSelectedDate(dt)
  }

  const scenarioCacheKey = selectedOccasion ? `${selectedOccasion.title}::${lang}` : ''
  const currentScenario = scenarioCacheKey ? scenarioCache[scenarioCacheKey] ?? null : null

  const generateScenario = async (occ: Occasion, force = false) => {
    const key = `${occ.title}::${lang}`
    if (!force && scenarioCache[key]) return
    setScenarioLoading(true)
    setScenarioError(null)
    try {
      const about = detailCache[detailKey(occ)]?.whatItIs ?? ''
      const seed = `A cinematic 10-second scene about "${occ.title}" (${occ.category}). ${about}`.trim()
      const { data, error: fnError } = await supabase.functions.invoke('enhance-prompt', {
        body: { prompt: seed, mode: 'silent' },
      })
      if (fnError) throw fnError
      const text = (data as { enhancedPrompt?: string })?.enhancedPrompt?.trim() ?? ''
      if (!text) throw new Error('Empty response')
      setScenarioCache((c) => ({ ...c, [key]: text }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate scenario'
      setScenarioError(msg)
      toast({ title: t.scenarioError, description: msg, variant: 'destructive' })
    } finally {
      setScenarioLoading(false)
    }
  }

  const pickOccasion = (occ: Occasion) => {
    setSelectedOccasion(occ)
    void loadDetail(occ)
    void generateScenario(occ)
  }

  const applyScenario = () => {
    if (!currentScenario || !onApplyPrompt) return
    onApplyPrompt(currentScenario)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('border-border bg-card p-0 text-foreground', todayOnly ? 'max-w-4xl' : 'max-w-7xl')}>
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-medium">
            <CalendarDays className="h-4 w-4 text-accent-warm" />
            <span>{todayOnly ? "Today's Occasions" : 'Calendar'}</span>
          </DialogTitle>
        </DialogHeader>
        <div className={cn('grid gap-0', todayOnly ? 'md:grid-cols-[1fr,1fr]' : 'md:grid-cols-[auto,1fr,1fr,1fr]')}>
          {/* Column 1: calendar */}
          {!todayOnly && (
          <div className="border-border p-4 md:border-r">

            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              month={visibleMonth}
              onMonthChange={(m) => setVisibleMonth(m)}
              className={cn('p-3 pointer-events-auto')}
            />
          </div>
          )}

          {/* Column 2: day details */}
          <div className="flex max-h-[70vh] min-h-[420px] flex-col md:border-r border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-2">
              <div className="text-sm font-medium text-foreground/90" dir="auto">{longLabel}</div>

            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {occasions.length === 0 && (
                <div className="px-2 text-sm text-muted-foreground" dir="auto">{t.empty}</div>
              )}
              {occasions.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {occasions.map((occ, i) => {
                    const isOpen = expandedIndex === i
                    return (
                      <li key={i} className="rounded-md border border-border/50 bg-accent/20">
                        <button
                          type="button"
                          onClick={() => { setExpandedIndex(isOpen ? null : i); pickOccasion(occ) }}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent/40',
                            isOpen && 'bg-accent/40',
                          )}
                          dir="auto"
                        >
                          <span className="text-sm font-medium text-accent-warm">{occ.title}</span>
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                              isOpen && 'rotate-180',
                            )}
                          />
                        </button>
                        {isOpen && (() => {
                          const key = detailKey(occ)
                          const detail = detailCache[key]
                          const isLoadingDetail = detailLoadingKey === key
                          return (
                            <div className="space-y-3 border-t border-border/50 px-3 py-3 text-sm text-foreground/90" dir="auto">
                              {isLoadingDetail && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <LoaderCircle className="h-4 w-4 animate-spin" />
                                  {t.loading}
                                </div>
                              )}
                              {!isLoadingDetail && !detail && detailError && (
                                <div className="text-sm text-rose-300">{detailError}</div>
                              )}
                              {detail && (
                                <>
                                  <div>
                                    <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.whatItIs}</div>
                                    <p className="leading-relaxed">{detail.whatItIs}</p>
                                  </div>
                                  <div>
                                    <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.history}</div>
                                    <p className="leading-relaxed">{detail.history}</p>
                                  </div>
                                </>
                              )}
                            </div>
                          )
                        })()}
                      </li>
                    )
                  })}
                </ul>
              )}

            </div>
          </div>

          {/* Column 3: month list with filters */}
          {!todayOnly && (
          <div className="flex max-h-[70vh] min-h-[420px] flex-col">

            <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-2">
              <div className="flex flex-col leading-tight">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.monthTitle}</div>
                <div className="text-sm font-medium text-foreground/90" dir="auto">{monthLabel}</div>
              </div>
              <div className="flex items-center gap-1">
                {filterIcons.map(({ cat, Icon, label }) => {
                  const on = activeFilters.has(cat)
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleFilter(cat)}
                      title={label}
                      aria-label={label}
                      aria-pressed={on}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-md border transition-colors',
                        on
                          ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/15'
                          : 'border-border bg-transparent text-muted-foreground hover:text-muted-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {filteredMonthOccasions && filteredMonthOccasions.length === 0 && (
                <div className="px-2 text-sm text-muted-foreground" dir="auto">{t.monthEmpty}</div>
              )}
              {filteredMonthOccasions && filteredMonthOccasions.length > 0 && (
                <ul className="flex flex-col gap-0.5">
                  {filteredMonthOccasions.map((occ, i) => {
                    const day = Number(occ.date.split('-')[2])
                    const isSelected = occ.date === dateKey
                    return (
                      <li key={`${occ.date}-${i}`}>
                        <button
                          type="button"
                          onClick={() => { handleMonthOccasionClick(occ.date); pickOccasion(occ) }}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/40',
                            isSelected && 'bg-accent/40',
                          )}
                          dir="auto"
                        >
                          <span className="mt-0.5 inline-flex h-6 w-7 shrink-0 items-center justify-center rounded text-xs font-medium text-muted-foreground">
                            {day}
                          </span>
                          <span className="text-sm font-medium leading-snug text-emerald-400 hover:text-emerald-300">
                            {occ.title}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
          )}




          {/* Column 4: AI scenario */}
          <div className="flex max-h-[70vh] min-h-[420px] flex-col md:border-l border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-2">
              <div className="flex items-center gap-2">
                <Clapperboard className="h-4 w-4 text-accent-warm" />
                <div className="text-sm font-medium text-foreground/90">{t.scenarioTitle}</div>
              </div>
              <span className="rounded-full border border-accent-warm/30 bg-accent-warm/10 px-2 py-0.5 text-[10px] font-semibold text-accent-warm">
                {t.badge10s}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {!selectedOccasion && (
                <div className="px-1 text-sm text-muted-foreground" dir="auto">{t.pickOccasion}</div>
              )}
              {selectedOccasion && (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-accent-warm" dir="auto">{selectedOccasion.title}</div>
                  {scenarioLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      {t.generating}
                    </div>
                  )}
                  {!scenarioLoading && scenarioError && !currentScenario && (
                    <div className="text-sm text-rose-300">{scenarioError}</div>
                  )}
                  {!scenarioLoading && currentScenario && (
                    <p className="whitespace-pre-wrap rounded-md border border-border/50 bg-accent/20 p-3 text-sm leading-relaxed text-foreground" dir="auto">
                      {currentScenario}
                    </p>
                  )}
                </div>
              )}
            </div>
            {selectedOccasion && (
              <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => generateScenario(selectedOccasion, true)}
                  disabled={scenarioLoading}
                  className="h-8 gap-1.5 text-xs text-foreground/80 hover:text-foreground"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', scenarioLoading && 'animate-spin')} />
                  {t.regenerate}
                </Button>
                <Button
                  size="sm"
                  onClick={applyScenario}
                  disabled={!currentScenario || scenarioLoading}
                  className="h-8 gap-1.5 bg-amber-300 text-xs font-semibold text-black hover:bg-amber-200"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  {t.useInPrompt}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
