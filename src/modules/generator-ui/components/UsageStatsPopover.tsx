// Usage Stats popover: shows lifetime videos made, credits spent, daily/monthly
// quota usage, an estimate of how many more videos the user can generate today
// per model, and a per-day spend calendar for the selected month.
//
// Read-only. All queries are RLS-scoped to auth.uid(). Data comes from the
// shared useUsageStats hook (single source of truth with Account Center).
import { useState } from 'react'
import {
  BarChart3, RefreshCw, Loader2, Film, Coins, CalendarClock, Gauge,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  useUsageStats, fmtUsd, monthLabel, PER_CLIP_USD,
} from '@/modules/generator-ui/hooks/useUsageStats'

export default function UsageStatsPopover({ triggerClassName }: { triggerClassName?: string } = {}) {
  const [open, setOpen] = useState(false)
  const {
    stats, loading, error, calLoading, dailySpend, viewMonth, setViewMonth,
    loadStats, loadCalendar, dailyLeft, dailyPct, monthPct, remainingVideos,
    avgUsdPerVideo, calendar, monthTotalCredits, todayKey, isCurrentMonthView, heatBg,
  } = useUsageStats(open)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Usage and credits"
          className={triggerClassName ?? 'fixed left-24 top-4 z-50 grid h-9 w-9 place-items-center rounded-md border border-transparent text-foreground/80 transition hover:border-border hover:bg-accent/45 hover:text-foreground sm:left-28 sm:top-5'}
        >
          <BarChart3 className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>

      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Gauge className="h-4 w-4 text-amber-300" />
            <span>Usage & credits</span>
            <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-300">
              <span className="relative grid h-1.5 w-1.5 place-items-center">
                <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400/70" />
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Live
            </span>
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
                <div className="rounded-md border border-border bg-accent/20 p-2 text-center">
                  <Film className="mx-auto mb-1 h-3.5 w-3.5 text-muted-foreground" />
                  <div className="text-base font-semibold tabular-nums">{stats.completedJobs}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Videos</div>
                </div>
                <div className="rounded-md border border-border bg-accent/20 p-2 text-center">
                  <Coins className="mx-auto mb-1 h-3.5 w-3.5 text-amber-300" />
                  <div className="text-base font-semibold tabular-nums">{stats.lifetimeSpend.toLocaleString()}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Cr spent</div>
                </div>
                <div className="rounded-md border border-border bg-accent/20 p-2 text-center">
                  <Coins className="mx-auto mb-1 h-3.5 w-3.5 text-emerald-300" />
                  <div className="text-base font-semibold tabular-nums">{stats.creditsBalance.toLocaleString()}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Balance</div>
                </div>
              </div>

              {stats.lifetimeSpendCount > 0 ? (
                <div className="text-[11px] text-muted-foreground">
                  Avg per generation: <span className="text-foreground/80 tabular-nums">{fmtUsd(avgUsdPerVideo)}</span>
                  {' · '}
                  <span className="text-foreground/80 tabular-nums">
                    {Math.round((stats.lifetimeSpend / stats.lifetimeSpendCount)).toLocaleString()} cr
                  </span>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" /> Today
                  </span>
                  <span className="tabular-nums text-foreground/80">
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
                  <span className="tabular-nums text-foreground/80">
                    {stats.usedMonth.toLocaleString()} / {stats.monthlyLimit.toLocaleString()} cr
                  </span>
                </div>
                <Progress value={monthPct} className="h-1.5" />
              </div>

              <div className="rounded-md border border-border bg-accent/20 p-3">
                <div className="mb-2 text-xs font-medium text-foreground/90">
                  How many more videos today?
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Veo 3 Fast (5s)</span>
                    <span className="tabular-nums text-foreground/90">
                      {remainingVideos(PER_CLIP_USD.veoFast5s)}
                      <span className="ml-1 text-muted-foreground">· {Math.round(PER_CLIP_USD.veoFast5s * 100)} cr</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Veo 3.1 Pro (5s)</span>
                    <span className="tabular-nums text-foreground/90">
                      {remainingVideos(PER_CLIP_USD.veoPro5s)}
                      <span className="ml-1 text-muted-foreground">· {Math.round(PER_CLIP_USD.veoPro5s * 100)} cr</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Wan 2.7 (1 clip)</span>
                    <span className="tabular-nums text-foreground/90">
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
              <div className="rounded-md border border-border bg-accent/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-medium text-foreground/90">Daily spend</div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon" variant="ghost" className="h-6 w-6"
                      onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <div className="min-w-[110px] text-center text-[11px] text-foreground/80">
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
                                isToday ? 'border-amber-300/60' : 'border-border/50',
                                heatBg(credits),
                              ].join(' ')}
                            >
                              <div className={isToday ? 'text-amber-200' : 'text-foreground/80'}>
                                {cell.date.getDate()}
                              </div>
                              {credits > 0 ? (
                                <div className="mt-0.5 tabular-nums text-[8.5px] text-foreground/90">
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
                  <span className="tabular-nums text-foreground/80">
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
