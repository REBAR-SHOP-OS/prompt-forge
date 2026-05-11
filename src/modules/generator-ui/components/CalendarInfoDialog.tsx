import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, LoaderCircle } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface CalendarInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApplyScenario?: (scenario: string) => void
}

type Category = 'canada' | 'international' | 'religious'

interface Occasion {
  title: string
  whatItIs: string
  history: string
  category: Category
  movieScenario: string
}

const fmt = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const labels = {
  whatItIs: 'About',
  history: 'History',
  movieScenario: 'Movie Scenario',
  apply: 'Apply to Prompt',
  empty: 'No major holiday on this day.',
  loading: 'Loading occasions…',
  pick: 'Pick a date to see occasions.',
}

export default function CalendarInfoDialog({ open, onOpenChange, onApplyScenario }: CalendarInfoDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => new Date())
  const [dayCache, setDayCache] = useState<Record<string, Occasion[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const { toast } = useToast()

  const dateKey = useMemo(() => fmt(selectedDate), [selectedDate])
  const dayCacheKey = `v4:${dateKey}:en`
  const occasions = dayCache[dayCacheKey] ?? null

  useEffect(() => {
    setExpandedIndex(null)
  }, [dayCacheKey])

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
          body: { date: dateKey, lang: 'en' },
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
  }, [open, dateKey, dayCacheKey, dayCache, toast])

  const longLabel = useMemo(
    () => selectedDate.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
    [selectedDate],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl border-white/10 bg-[#0b0c0e]/95 p-0 text-zinc-100">
        <DialogHeader className="border-b border-white/10 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-medium">
            <CalendarDays className="h-4 w-4 text-amber-300" />
            <span>Calendar</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-0 md:grid-cols-[auto,1fr,1fr]">
          {/* Column 1: calendar */}
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

          {/* Column 2: day details */}
          <div className="flex max-h-[70vh] min-h-[420px] flex-col md:border-r border-white/10">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-4">
              <div className="text-sm font-medium text-zinc-200">{longLabel}</div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {loading && (
                <div className="flex items-center gap-2 px-2 text-sm text-zinc-400">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  {labels.loading}
                </div>
              )}
              {!loading && error && (
                <div className="px-2 text-sm text-rose-300">{error}</div>
              )}
              {!loading && !error && occasions && occasions.length === 0 && (
                <div className="px-2 text-sm text-zinc-400">{labels.empty}</div>
              )}
              {!loading && !error && occasions && occasions.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {occasions.map((occ, i) => {
                    const isOpen = expandedIndex === i
                    return (
                      <li key={i} className="rounded-md border border-white/5 bg-white/[0.02]">
                        <button
                          type="button"
                          onClick={() => setExpandedIndex(isOpen ? null : i)}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]',
                            isOpen && 'bg-white/[0.04]',
                          )}
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
                          <div className="space-y-3 border-t border-white/5 px-3 py-3 text-sm text-zinc-200">
                            <div>
                              <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">{labels.whatItIs}</div>
                              <p className="leading-relaxed">{occ.whatItIs}</p>
                            </div>
                            <div>
                              <div className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">{labels.history}</div>
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
                <div className="px-2 text-sm text-zinc-400">{labels.pick}</div>
              )}
            </div>
          </div>

          {/* Column 3: movie scenario detail */}
          <div className="flex max-h-[70vh] min-h-[420px] flex-col">
            <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4">
              <div className="text-sm font-medium text-zinc-200">{labels.movieScenario}</div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-6">
              {expandedIndex != null && occasions && occasions[expandedIndex] ? (
                <div className="space-y-6">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 shadow-inner">
                    <p className="text-sm leading-relaxed text-zinc-200 italic">
                      "{occasions[expandedIndex].movieScenario}"
                    </p>
                  </div>
                  <Button
                    onClick={() => onApplyScenario?.(occasions[expandedIndex].movieScenario)}
                    className="w-full gap-2 rounded-full bg-amber-300 text-zinc-950 hover:bg-amber-400"
                  >
                    {labels.apply}
                  </Button>
                  <p className="text-center text-[10px] uppercase tracking-wider text-zinc-500">
                    Sets duration to 10 seconds
                  </p>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-center px-4">
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Select an occasion to see a suggested movie scenario.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
