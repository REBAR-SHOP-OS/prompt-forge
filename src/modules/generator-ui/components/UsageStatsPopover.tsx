// Usage Stats popover: shows lifetime videos made, credits spent, daily/monthly
// quota usage, an estimate of how many more videos the user can generate today
// per model, and a per-day spend calendar for the selected month.
//
// Read-only. All queries are RLS-scoped to auth.uid().
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3, RefreshCw, Loader2, Film, Coins, CalendarClock, Gauge,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/core/auth/AuthProvider'
import { supabase } from '@/integrations/supabase/client'

interface Stats {
  creditsBalance: number
  dailyLimit: number
  monthlyLimit: number
  usedToday: number
  usedMonth: number
  lastResetDay: string | null
  lifetimeSpend: number
  lifetimeSpendCount: number
  completedJobs: number
}

interface DayCell {
  credits: number
  count: number
}

const PER_CLIP_USD = {
  veoFast5s: 0.10 * 5,
  veoPro5s: 0.40 * 5,
  wan: 0.15,
} as const

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isoForDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtUsd(n: number) { return `$${n.toFixed(2)}` }
function monthLabel(d: Date) {
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

export default function UsageStatsPopover({ triggerClassName }: { triggerClassName?: string } = {}) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)

  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [calLoading, setCalLoading] = useState(false)
  const [dailySpend, setDailySpend] = useState<Map<string, DayCell>>(new Map())

  const loadStats = useCallback(async () => {
    if (!user) return
    setLoading(true); setError(null)
    try {
      const [profileRes, quotaRes, spendRes, jobsRes] = await Promise.all([
        supabase.from('core_user_profiles').select('credits_balance').eq('id', user.id).maybeSingle(),
        supabase.from('billing_user_quotas')
          .select('daily_limit_credits,monthly_limit_credits,used_today,used_this_month,last_reset_day')
          .eq('user_id', user.id).maybeSingle(),
        supabase.from('billing_credit_transactions').select('amount').eq('user_id', user.id).eq('type', 'spend'),
        supabase.from('generator_generation_jobs').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('status', 'completed'),
      ])
      if (profileRes.error) throw profileRes.error
      if (quotaRes.error) throw quotaRes.error
      if (spendRes.error) throw spendRes.error
      if (jobsRes.error) throw jobsRes.error

      const spendRows = (spendRes.data ?? []) as Array<{ amount: number }>
      const lifetimeSpend = spendRows.reduce((s, r) => s + Math.abs(r.amount || 0), 0)
      const quota = quotaRes.data
      const today = todayIso()
      const usedTodayRaw = quota?.used_today ?? 0
      const usedToday = quota && quota.last_reset_day && quota.last_reset_day < today ? 0 : usedTodayRaw

      setStats({
        creditsBalance: profileRes.data?.credits_balance ?? 0,
        dailyLimit: quota?.daily_limit_credits ?? 1500,
        monthlyLimit: quota?.monthly_limit_credits ?? 30000,
        usedToday,
        usedMonth: quota?.used_this_month ?? 0,
        lastResetDay: quota?.last_reset_day ?? null,
        lifetimeSpend,
        lifetimeSpendCount: spendRows.length,
        completedJobs: jobsRes.count ?? 0,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load usage')
    } finally {
      setLoading(false)
    }
  }, [user])

  const loadCalendar = useCallback(async (month: Date) => {
    if (!user) return
    setCalLoading(true)
    try {
      const start = new Date(month.getFullYear(), month.getMonth(), 1)
      const end = new Date(month.getFullYear(), month.getMonth() + 1, 1)
      const { data, error: err } = await supabase
        .from('billing_credit_transactions')
        .select('amount, created_at')
        .eq('user_id', user.id)
        .eq('type', 'spend')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
      if (err) throw err

      const map = new Map<string, DayCell>()
      for (const row of (data ?? []) as Array<{ amount: number; created_at: string }>) {
        const d = new Date(row.created_at)
        const key = isoForDate(d)
        const prev = map.get(key) ?? { credits: 0, count: 0 }
        prev.credits += Math.abs(row.amount || 0)
        prev.count += 1
        map.set(key, prev)
      }
      setDailySpend(map)
    } catch (e) {
      // Non-fatal — keep calendar empty
      console.error('calendar load failed', e)
      setDailySpend(new Map())
    } finally {
      setCalLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (open) { void loadStats(); void loadCalendar(viewMonth) }
  }, [open, loadStats, loadCalendar, viewMonth])

  // Live updates: while the popover is open, subscribe to changes on the
  // user's billing/usage rows and refresh (debounced) so figures update
  // instantly as credits are consumed — no manual refresh needed.
  useEffect(() => {
    if (!open || !user) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const scheduleStats = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void loadStats() }, 300)
    }
    let calTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleAll = () => {
      scheduleStats()
      if (calTimer) clearTimeout(calTimer)
      calTimer = setTimeout(() => { void loadCalendar(viewMonth) }, 300)
    }

    const channel = supabase
      .channel(`usage-stats-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_user_quotas', filter: `user_id=eq.${user.id}` }, scheduleStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'core_user_profiles', filter: `id=eq.${user.id}` }, scheduleStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_credit_transactions', filter: `user_id=eq.${user.id}` }, scheduleAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'generator_generation_jobs', filter: `user_id=eq.${user.id}` }, scheduleStats)
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      if (calTimer) clearTimeout(calTimer)
      void supabase.removeChannel(channel)
    }
  }, [open, user, viewMonth, loadStats, loadCalendar])

  const dailyLeft = stats ? Math.max(0, stats.dailyLimit - stats.usedToday) : 0
  const dailyPct = stats && stats.dailyLimit > 0 ? Math.min(100, (stats.usedToday / stats.dailyLimit) * 100) : 0
  const monthPct = stats && stats.monthlyLimit > 0 ? Math.min(100, (stats.usedMonth / stats.monthlyLimit) * 100) : 0
  const effectiveCreditsLeft = stats ? Math.min(dailyLeft, stats.creditsBalance) : 0
  const remainingVideos = (perClipUsd: number) => {
    const cpv = Math.round(perClipUsd * 100)
    if (cpv <= 0) return 0
    return Math.floor(effectiveCreditsLeft / cpv)
  }
  const avgUsdPerVideo = stats && stats.lifetimeSpendCount > 0
    ? (stats.lifetimeSpend / 100) / stats.lifetimeSpendCount : 0

  // Build calendar grid (leading blanks + days of month)
  const calendar = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const firstDow = new Date(year, month, 1).getDay() // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: Array<{ key: string; date: Date | null; iso: string | null }> = []
    for (let i = 0; i < firstDow; i++) cells.push({ key: `b${i}`, date: null, iso: null })
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      cells.push({ key: `d${d}`, date, iso: isoForDate(date) })
    }
    return cells
  }, [viewMonth])

  const monthTotalCredits = useMemo(() => {
    let s = 0; let c = 0
    for (const [, v] of dailySpend) { s += v.credits; c += v.count }
    return { credits: s, count: c }
  }, [dailySpend])

  const maxDayCredits = useMemo(() => {
    let m = 0; for (const [, v] of dailySpend) if (v.credits > m) m = v.credits; return m
  }, [dailySpend])

  const todayKey = todayIso()
  const isCurrentMonthView = (() => {
    const n = new Date()
    return n.getFullYear() === viewMonth.getFullYear() && n.getMonth() === viewMonth.getMonth()
  })()

  function heatBg(credits: number) {
    if (credits <= 0 || maxDayCredits <= 0) return 'bg-white/[0.02]'
    const ratio = credits / maxDayCredits
    if (ratio > 0.75) return 'bg-amber-400/30'
    if (ratio > 0.5) return 'bg-amber-400/20'
    if (ratio > 0.25) return 'bg-amber-400/12'
    return 'bg-amber-400/[0.07]'
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Usage and credits"
          className={triggerClassName ?? 'fixed left-24 top-4 z-50 grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-200/80 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-zinc-100 sm:left-28 sm:top-5'}
        >
          <BarChart3 className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>

      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Gauge className="h-4 w-4 text-amber-300" />
            <span>Usage & credits</span>
          </div>
          <Button
            size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => { void loadStats(); void loadCalendar(viewMonth) }}
            disabled={loading || calLoading} aria-label="Refresh"
          >
            {(loading || calLoading) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <div className="max-h-[78vh] space-y-4 overflow-y-auto px-4 py-4 text-sm">
          {error ? (
            <p className="text-xs text-rose-300">{error}</p>
          ) : !stats ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-white/10 bg-white/[0.02] p-2 text-center">
                  <Film className="mx-auto mb-1 h-3.5 w-3.5 text-zinc-400" />
                  <div className="text-base font-semibold tabular-nums">{stats.completedJobs}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Videos</div>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.02] p-2 text-center">
                  <Coins className="mx-auto mb-1 h-3.5 w-3.5 text-amber-300" />
                  <div className="text-base font-semibold tabular-nums">{stats.lifetimeSpend.toLocaleString()}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Cr spent</div>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.02] p-2 text-center">
                  <Coins className="mx-auto mb-1 h-3.5 w-3.5 text-emerald-300" />
                  <div className="text-base font-semibold tabular-nums">{stats.creditsBalance.toLocaleString()}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Balance</div>
                </div>
              </div>

              {stats.lifetimeSpendCount > 0 ? (
                <div className="text-[11px] text-muted-foreground">
                  Avg per generation: <span className="text-zinc-300 tabular-nums">{fmtUsd(avgUsdPerVideo)}</span>
                  {' · '}
                  <span className="text-zinc-300 tabular-nums">
                    {Math.round((stats.lifetimeSpend / stats.lifetimeSpendCount)).toLocaleString()} cr
                  </span>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" /> Today
                  </span>
                  <span className="tabular-nums text-zinc-300">
                    {stats.usedToday.toLocaleString()} / {stats.dailyLimit.toLocaleString()} cr
                  </span>
                </div>
                <Progress value={dailyPct} className="h-1.5" />
                <div className="text-[11px] text-muted-foreground">
                  {dailyLeft.toLocaleString()} credits left today
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">This month</span>
                  <span className="tabular-nums text-zinc-300">
                    {stats.usedMonth.toLocaleString()} / {stats.monthlyLimit.toLocaleString()} cr
                  </span>
                </div>
                <Progress value={monthPct} className="h-1.5" />
              </div>

              <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                <div className="mb-2 text-xs font-medium text-zinc-200">
                  How many more videos today?
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Veo 3 Fast (5s)</span>
                    <span className="tabular-nums text-zinc-200">
                      {remainingVideos(PER_CLIP_USD.veoFast5s)}
                      <span className="ml-1 text-muted-foreground">· {Math.round(PER_CLIP_USD.veoFast5s * 100)} cr</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Veo 3.1 Pro (5s)</span>
                    <span className="tabular-nums text-zinc-200">
                      {remainingVideos(PER_CLIP_USD.veoPro5s)}
                      <span className="ml-1 text-muted-foreground">· {Math.round(PER_CLIP_USD.veoPro5s * 100)} cr</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Wan 2.7 (1 clip)</span>
                    <span className="tabular-nums text-zinc-200">
                      {remainingVideos(PER_CLIP_USD.wan)}
                      <span className="ml-1 text-muted-foreground">· {Math.round(PER_CLIP_USD.wan * 100)} cr</span>
                    </span>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  Estimates. Limited by daily quota and wallet balance.
                </div>
              </div>

              {/* Daily-spend calendar */}
              <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-medium text-zinc-200">Daily spend</div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon" variant="ghost" className="h-6 w-6"
                      onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <div className="min-w-[110px] text-center text-[11px] text-zinc-300">
                      {monthLabel(viewMonth)}
                    </div>
                    <Button
                      size="icon" variant="ghost" className="h-6 w-6"
                      onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                      disabled={isCurrentMonthView}
                      aria-label="Next month"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="mb-1 grid grid-cols-7 gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                  {['S','M','T','W','T','F','S'].map((d, i) => (
                    <div key={i} className="text-center">{d}</div>
                  ))}
                </div>

                <TooltipProvider delayDuration={150}>
                  <div className="grid grid-cols-7 gap-1">
                    {calendar.map((cell) => {
                      if (!cell.date || !cell.iso) {
                        return <div key={cell.key} className="aspect-square" />
                      }
                      const data = dailySpend.get(cell.iso)
                      const credits = data?.credits ?? 0
                      const count = data?.count ?? 0
                      const usd = credits / 100
                      const isToday = cell.iso === todayKey
                      return (
                        <Tooltip key={cell.key}>
                          <TooltipTrigger asChild>
                            <div
                              className={[
                                'flex aspect-square flex-col items-center justify-center rounded-[4px] border text-[9px] leading-none',
                                isToday ? 'border-amber-300/60' : 'border-white/5',
                                heatBg(credits),
                              ].join(' ')}
                            >
                              <div className={isToday ? 'text-amber-200' : 'text-zinc-300'}>
                                {cell.date.getDate()}
                              </div>
                              {credits > 0 ? (
                                <div className="mt-0.5 tabular-nums text-[8.5px] text-zinc-200/90">
                                  ${usd.toFixed(usd >= 10 ? 0 : 2)}
                                </div>
                              ) : null}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <div className="font-medium">{cell.date.toDateString()}</div>
                            {credits > 0 ? (
                              <div className="text-muted-foreground">
                                {fmtUsd(usd)} · {credits.toLocaleString()} cr · {count} {count === 1 ? 'gen' : 'gens'}
                              </div>
                            ) : (
                              <div className="text-muted-foreground">No spend</div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      )
                    })}
                  </div>
                </TooltipProvider>

                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {calLoading ? 'Loading…' : `${monthTotalCredits.count} ${monthTotalCredits.count === 1 ? 'generation' : 'generations'}`}
                  </span>
                  <span className="tabular-nums text-zinc-300">
                    Total: {fmtUsd(monthTotalCredits.credits / 100)} · {monthTotalCredits.credits.toLocaleString()} cr
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
