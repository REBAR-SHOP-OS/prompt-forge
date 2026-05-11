import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, Languages, LoaderCircle } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface CalendarInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Occasion {
  title: string
  whatItIs: string
  history: string
}

const fmt = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const labels = {
  en: { whatItIs: 'About', history: 'History', empty: 'No major holiday on this day.', loading: 'Loading occasions…', pick: 'Pick a date to see occasions.' },
  fa: { whatItIs: 'معرفی', history: 'تاریخچه', empty: 'مناسبت مهمی برای این روز ثبت نشده است.', loading: 'در حال بارگذاری…', pick: 'یک تاریخ انتخاب کنید تا مناسبت‌ها را ببینید.' },
}

export default function CalendarInfoDialog({ open, onOpenChange }: CalendarInfoDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [lang, setLang] = useState<'en' | 'fa'>('en')
  const [cache, setCache] = useState<Record<string, Occasion[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const { toast } = useToast()

  const dateKey = useMemo(() => fmt(selectedDate), [selectedDate])
  const cacheKey = `${dateKey}:${lang}`
  const occasions = cache[cacheKey] ?? null
  const t = labels[lang]

  useEffect(() => {
    setExpandedIndex(null)
  }, [cacheKey])

  useEffect(() => {
    if (!open) return
    if (cache[cacheKey]) return
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
        setCache((c) => ({ ...c, [cacheKey]: list }))
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
  }, [open, dateKey, lang, cacheKey, cache, toast])

  const longLabel = useMemo(
    () => selectedDate.toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
    [selectedDate, lang],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-white/10 bg-[#0b0c0e]/95 p-0 text-zinc-100">
        <DialogHeader className="border-b border-white/10 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-medium">
            <CalendarDays className="h-4 w-4 text-amber-300" />
            <span>Marketing Calendar</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-0 md:grid-cols-[auto,1fr]">
          <div className="border-white/10 p-4 md:border-r">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(d) => d && setSelectedDate(d)}
              className={cn('p-3 pointer-events-auto')}
            />
          </div>
          <div className="flex max-h-[70vh] min-h-[420px] flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-2">
              <div className="text-sm font-medium text-zinc-200" dir="auto">{longLabel}</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLang((l) => (l === 'en' ? 'fa' : 'en'))}
                className={cn(
                  'h-8 gap-1.5 px-2 text-xs',
                  lang === 'fa' ? 'text-amber-300 hover:text-amber-200' : 'text-zinc-400 hover:text-zinc-200',
                )}
                aria-label="Toggle Persian translation"
                title={lang === 'en' ? 'نمایش به فارسی' : 'Show in English'}
              >
                <Languages className="h-4 w-4" />
                {lang === 'en' ? 'EN' : 'فا'}
              </Button>
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
                          onClick={() => setExpandedIndex(isOpen ? null : i)}
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
