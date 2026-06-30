import { useEffect, useState, type ReactNode } from 'react'
import { getJobProgressPercent, isTerminalStatus } from '@/modules/generator-ui/pages/DashboardPage'

type ProgressJob = {
  id?: string
  status: string
  progress_percent?: number | null
  created_at: string
  requested_duration?: number | null
}

type Props = {
  job: ProgressJob
  /** Render prop receiving the current monotonic progress percent (or null). */
  children: (pct: number | null) => ReactNode
}

/**
 * Self-contained, per-job progress ticker.
 *
 * The time-based progress estimate advances between API polls. Previously a
 * single page-wide `setInterval` re-rendered the entire DashboardPage every
 * second to animate this, which forced the heavy Preview <video> subtree to
 * re-render once per second and caused visible playback stutter/lag.
 *
 * This component isolates the 1s tick to its own local state, so ONLY the tiny
 * progress widget re-renders each second — the preview player is never touched.
 */
export function LiveJobProgress({ job, children }: Props) {
  const [, setTick] = useState(0)

  const active = !isTerminalStatus(job.status)
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [active])

  return <>{children(getJobProgressPercent(job))}</>
}

export default LiveJobProgress
