// Usage Stats popover: shows lifetime videos made, credits spent, daily/monthly
// quota usage, and an estimate of how many more videos the user can generate
// today per model.
//
// Read-only. All queries are RLS-scoped to auth.uid().
//
// Pricing mirrors estimateGenerationCost() in DashboardPage.tsx and the backend
// COST_MAP_USD in supabase/functions/_shared/modules/external-api-adapter/service.ts.
// 1 USD = 100 credits. Keep all three in sync.
import { useCallback, useEffect, useState } from 'react'
import { BarChart3, RefreshCw, Loader2, Film, Coins, CalendarClock, Gauge } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/core/auth/AuthProvider'
import { supabase } from '@/integrations/supabase/client'

interface Stats {
  creditsBalance: number
  dailyLimit: number
  monthlyLimit: number
  usedToday: number
  usedMonth: number
  lastResetDay: string | null
  lifetimeSpend: number       // credits
  lifetimeSpendCount: number  // # of spend txns ≈ # of generations
  completedJobs: number
}

// Per-clip USD cost (credits = usd * 100). Mirrors backend.
const PER_CLIP_USD = {
  veoFast5s: 0.10 * 5,    // Veo 3 Fast @ 5s
  veoPro5s: 0.40 * 5,     // Veo 3.1 Pro @ 5s
  wan: 0.15,              // Wan 2.7 (fixed per clip)
} as const

function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtUsd(n: number) {
  return `$${n.toFixed(2)}`
}

export default function UsageStatsPopover() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
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
      const lifetimeSpendCount = spendRows.length

      const quota = quotaRes.data
      const today = todayIso()
      // Stale-day fallback: quota row hasn't been touched today yet.
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
        lifetimeSpendCount,
        completedJobs: jobsRes.count ?? 0,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load usage')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const dailyLeft = stats ? Math.max(0, stats.dailyLimit - stats.usedToday) : 0
  const dailyPct = stats && stats.dailyLimit > 0 ? Math.min(100, (stats.usedToday / stats.dailyLimit) * 100) : 0
  const monthPct = stats && stats.monthlyLimit > 0 ? Math.min(100, (stats.usedMonth / stats.monthlyLimit) * 100) : 0

  // What limits the user today: min(daily quota left, wallet balance).
  const effectiveCreditsLeft = stats ? Math.min(dailyLeft, stats.creditsBalance) : 0

  const remainingVideos = (perClipUsd: number) => {
    const creditsPerVideo = Math.round(perClipUsd * 100)
    if (creditsPerVideo <= 0) return 0
    return Math.floor(effectiveCreditsLeft / creditsPerVideo)
  }

  const avgUsdPerVideo = stats && stats.lifetimeSpendCount > 0
    ? (stats.lifetimeSpend / 100) / stats.lifetimeSpendCount
    : 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Usage and credits"
          className="fixed left-24 top-4 z-50 grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-200/80 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-zinc-100 sm:left-28 sm:top-5"
        >
          <BarChart3 className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[340px] p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Gauge className="h-4 w-4 text-amber-300" />
            <span>Usage & credits</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <div className="space-y-4 px-4 py-4 text-sm">
          {error ? (
            <p className="text-xs text-rose-300">{error}</p>
          ) : !stats ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {/* Lifetime stats */}
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

              {/* Daily quota */}
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

              {/* Monthly quota */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">This month</span>
                  <span className="tabular-nums text-zinc-300">
                    {stats.usedMonth.toLocaleString()} / {stats.monthlyLimit.toLocaleString()} cr
                  </span>
                </div>
                <Progress value={monthPct} className="h-1.5" />
              </div>

              {/* How many more videos today */}
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
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
