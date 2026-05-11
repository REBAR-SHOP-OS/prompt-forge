import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CalendarDays, LoaderCircle } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface CalendarInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const fmt = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function CalendarInfoDialog({ open, onOpenChange }: CalendarInfoDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [cache, setCache] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  const dateKey = useMemo(() => fmt(selectedDate), [selectedDate])
  const info = cache[dateKey] ?? null

  useEffect(() => {
    if (!open) return
    if (cache[dateKey]) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('day-info', {
          body: { date: dateKey },
        })
        if (cancelled) return
        if (fnError) throw fnError
        const markdown: string = (data as { markdown?: string })?.markdown ?? ''
        if (!markdown) throw new Error('No content returned.')
        setCache((c) => ({ ...c, [dateKey]: markdown }))
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
  }, [open, dateKey, cache, toast])

  const longLabel = useMemo(
    () => selectedDate.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
    [selectedDate],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-white/10 bg-[#0b0c0e]/95 p-0 text-zinc-100">
        <DialogHeader className="border-b border-white/10 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-medium">
            <CalendarDays className="h-4 w-4 text-amber-300" />
            Day Information
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
            <div className="border-b border-white/10 px-5 py-3 text-sm font-medium text-zinc-200">
              {longLabel}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Loading information…
                </div>
              )}
              {!loading && error && (
                <div className="text-sm text-rose-300">{error}</div>
              )}
              {!loading && !error && info && (
                <div className="prose prose-sm prose-invert max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-li:my-0.5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{info}</ReactMarkdown>
                </div>
              )}
              {!loading && !error && !info && (
                <div className="text-sm text-zinc-400">Pick a date to see its information.</div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
