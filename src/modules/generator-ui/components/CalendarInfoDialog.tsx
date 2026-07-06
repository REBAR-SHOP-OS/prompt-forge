import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, Church, Clapperboard, Globe2, Languages, Leaf, LoaderCircle, RefreshCw, Wand2 } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface CalendarInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApplyPrompt?: (prompt: string) => void
  todayOnly?: boolean
}

type Category = 'canada' | 'international' | 'religious'

interface Occasion {
  title: string
  whatItIs: string
  history: string
  category: Category
}

interface MonthOccasion extends Occasion {
  date: string // YYYY-MM-DD
}

const fmt = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
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
  const [dayCache, setDayCache] = useState<Record<string, Occasion[]>>({})
  const [monthCache, setMonthCache] = useState<Record<string, MonthOccasion[]>>({})
  const [loading, setLoading] = useState(false)
  const [monthLoading, setMonthLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [monthError, setMonthError] = useState<string | null>(null)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [activeFilters, setActiveFilters] = useState<Set<Category>>(() => new Set(ALL_CATEGORIES))
  const [selectedOccasion, setSelectedOccasion] = useState<Occasion | null>(null)
  const [scenarioCache, setScenarioCache] = useState<Record<string, string>>({})
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const { toast } = useToast()

  const dateKey = useMemo(() => fmt(selectedDate), [selectedDate])
  const monthKey = useMemo(() => fmtMonth(visibleMonth), [visibleMonth])
  const dayCacheKey = `v2:${dateKey}:${lang}`
  const monthCacheKey = `v1:${monthKey}:${lang}`
  const occasions = dayCache[dayCacheKey] ?? null
  const monthOccasions = monthCache[monthCacheKey] ?? null
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


  // Day fetch
  useEffect(() => {
    if (!open) return
    if (dayCache[dayCacheKey]) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('day-info', {
          body: { date: dateKey, lang },
        })
        if (cancelled) return
        if (fnError) throw fnError
        const list: Occasion[] = Array.isArray((data as { occasions?: Occasion[] })?.occasions)
          ? (data as { occasions: Occasion[] }).occasions
          : []
        setDayCache((c) => ({ ...c, [dayCacheKey]: list }))
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Failed to load day info'
        setError(msg)
        toast({ title: 'Could not load day info', description: msg, variant: 'destructive' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, dateKey, lang, dayCacheKey, dayCache, toast])

  // Month fetch
  useEffect(() => {
    if (!open) return
    if (monthCache[monthCacheKey]) return
    let cancelled = false
    setMonthLoading(true)
    setMonthError(null)
    ;(async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('day-info', {
          body: { month: monthKey, lang },
        })
        if (cancelled) return
        if (fnError) throw fnError
        const list: MonthOccasion[] = Array.isArray((data as { occasions?: MonthOccasion[] })?.occasions)
          ? (data as { occasions: MonthOccasion[] }).occasions
          : []
        setMonthCache((c) => ({ ...c, [monthCacheKey]: list }))
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Failed to load month info'
        setMonthError(msg)
      } finally {
        if (!cancelled) setMonthLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, monthKey, lang, monthCacheKey, monthCache])

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
      const seed = `A cinematic 10-second scene about "${occ.title}". ${occ.whatItIs}`
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
    void generateScenario(occ)
  }

  const applyScenario = () => {
    if (!currentScenario || !onApplyPrompt) return
    onApplyPrompt(currentScenario)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('border-white/10 bg-[#0b0c0e]/95 p-0 text-zinc-100', todayOnly ? 'max-w-4xl' : 'max-w-7xl')}>
        <DialogHeader className="border-b border-white/10 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-medium">
            <CalendarDays className="h-4 w-4 text-amber-300" />
            <span>{todayOnly ? "Today's Occasions" : 'Calendar'}</span>
          </DialogTitle>
        </DialogHeader>
        <div className={cn('grid gap-0', todayOnly ? 'md:grid-cols-[1fr,1fr]' : 'md:grid-cols-[auto,1fr,1fr,1fr]')}>
          {/* Column 1: calendar */}
          {!todayOnly && (
          <div className="border-white/10 p-4 md:border-r">

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
          <div className="flex max-h-[70vh] min-h-[420px] flex-col md:border-r border-white/10">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-2">
              <div className="text-sm font-medium text-zinc-200" dir="auto">{longLabel}</div>

            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {loading && (
                <div className="flex items-center gap-2 px-2 text-sm text-zinc-400">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  {t.loading}
                </div>
              )}
              {!loading && error && (
                <div className="px-2 text-sm text-rose-300">{error}</div>
              )}
              {!loading && !error && occasions && occasions.length === 0 && (
                <div className="px-2 text-sm text-zinc-400" dir="auto">{t.empty}</div>
              )}
              {!loading && !error && occasions && occasions.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {occasions.map((occ, i) => {
                    const isOpen = expandedIndex === i
                    return (
                      <li key={i} className="rounded-md border border-white/5 bg-white/[0.02]">
                        <button
                          type="button"
                          onClick={() => { setExpandedIndex(isOpen ? null : i); pickOccasion(occ) }}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]',
                            isOpen && 'bg-white/[0.04]',
                          )}
                          dir="auto"
                        >
                          <span className="text-sm font-medium text-amber-300">{occ.title}</span>
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 shrink-0 text-zinc-500 transition-transform',
                              isOpen && 'rotate-180',
                            )}
                          />
                        </button>
                        {isOpen && (
                          <div className="space-y-3 border-t border-white/5 px-3 py-3 text-sm text-zinc-200" dir="auto">
                            <div>
                              <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">{t.whatItIs}</div>
                              <p className="leading-relaxed">{occ.whatItIs}</p>
                            </div>
                            <div>
                              <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">{t.history}</div>
                              <p className="leading-relaxed">{occ.history}</p>
                            </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              {!loading && !error && !occasions && (
                <div className="px-2 text-sm text-zinc-400" dir="auto">{t.pick}</div>
              )}
            </div>
          </div>

          {/* Column 3: month list with filters */}
          {!todayOnly && (
          <div className="flex max-h-[70vh] min-h-[420px] flex-col">

            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-2">
              <div className="flex flex-col leading-tight">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">{t.monthTitle}</div>
                <div className="text-sm font-medium text-zinc-200" dir="auto">{monthLabel}</div>
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
                          : 'border-white/10 bg-transparent text-zinc-600 hover:text-zinc-400',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {monthLoading && (
                <div className="flex items-center gap-2 px-2 text-sm text-zinc-400">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  {t.loading}
                </div>
              )}
              {!monthLoading && monthError && (
                <div className="px-2 text-sm text-rose-300">{monthError}</div>
              )}
              {!monthLoading && !monthError && filteredMonthOccasions && filteredMonthOccasions.length === 0 && (
                <div className="px-2 text-sm text-zinc-400" dir="auto">{t.monthEmpty}</div>
              )}
              {!monthLoading && !monthError && filteredMonthOccasions && filteredMonthOccasions.length > 0 && (
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
                            'flex w-full items-start gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]',
                            isSelected && 'bg-white/[0.04]',
                          )}
                          dir="auto"
                        >
                          <span className="mt-0.5 inline-flex h-6 w-7 shrink-0 items-center justify-center rounded text-xs font-medium text-zinc-400">
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
          <div className="flex max-h-[70vh] min-h-[420px] flex-col md:border-l border-white/10">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-2">
              <div className="flex items-center gap-2">
                <Clapperboard className="h-4 w-4 text-amber-300" />
                <div className="text-sm font-medium text-zinc-200">{t.scenarioTitle}</div>
              </div>
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                {t.badge10s}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {!selectedOccasion && (
                <div className="px-1 text-sm text-zinc-400" dir="auto">{t.pickOccasion}</div>
              )}
              {selectedOccasion && (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-amber-300" dir="auto">{selectedOccasion.title}</div>
                  {scenarioLoading && (
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      {t.generating}
                    </div>
                  )}
                  {!scenarioLoading && scenarioError && !currentScenario && (
                    <div className="text-sm text-rose-300">{scenarioError}</div>
                  )}
                  {!scenarioLoading && currentScenario && (
                    <p className="whitespace-pre-wrap rounded-md border border-white/5 bg-white/[0.02] p-3 text-sm leading-relaxed text-zinc-100" dir="auto">
                      {currentScenario}
                    </p>
                  )}
                </div>
              )}
            </div>
            {selectedOccasion && (
              <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => generateScenario(selectedOccasion, true)}
                  disabled={scenarioLoading}
                  className="h-8 gap-1.5 text-xs text-zinc-300 hover:text-zinc-100"
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
