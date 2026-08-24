// Single source of truth for a user's usage/credits data.
//
// Extracted from UsageStatsPopover so the Account Center dialog and the
// popover both read the same figures from the same queries. Read-only: every
// query is RLS-scoped to auth.uid().
//
// `enabled` gates loading + the live subscription. Pass `open` from the
// popover/dialog so data only loads while the surface is visible.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/core/auth/AuthProvider'
import { supabase } from '@/integrations/supabase/client'

export interface UsageStats {
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

export interface DayCell {
  credits: number
  count: number
}

export const PER_CLIP_USD = {
  veoFast5s: 0.10 * 5,
  veoPro5s: 0.40 * 5,
  wan: 0.15,
} as const

export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function isoForDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function fmtUsd(n: number) { return `$${n.toFixed(2)}` }
export function monthLabel(d: Date) {
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

export function useUsageStats(enabled: boolean) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<UsageStats | null>(null)

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
    if (enabled) { void loadStats(); void loadCalendar(viewMonth) }
  }, [enabled, loadStats, loadCalendar, viewMonth])

  // Live updates: while enabled, subscribe to changes on the user's
  // billing/usage rows and refresh (debounced) so figures update instantly as
  // credits are consumed — no manual refresh needed.
  useEffect(() => {
    if (!enabled || !user) return
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
  }, [enabled, user, viewMonth, loadStats, loadCalendar])

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

  return {
    stats,
    loading,
    error,
    calLoading,
    dailySpend,
    viewMonth,
    setViewMonth,
    loadStats,
    loadCalendar,
    dailyLeft,
    dailyPct,
    monthPct,
    effectiveCreditsLeft,
    remainingVideos,
    avgUsdPerVideo,
    calendar,
    monthTotalCredits,
    maxDayCredits,
    todayKey,
    isCurrentMonthView,
    heatBg,
  }
}
