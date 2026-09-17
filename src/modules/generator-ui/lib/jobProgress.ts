const progressMax = new Map<string, number>()

function normalizeProgressStatus(status: string) {
  if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'processing') {
    return status
  }
  return 'pending'
}

export function isTerminalStatus(status: string) {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

export function getJobProgressPercent(job: {
  id?: string
  status: string
  progress_percent?: number | null
  created_at: string
  requested_duration?: number | null
}): number | null {
  const status = normalizeProgressStatus(job.status)
  if (status === 'completed') {
    if (job.id) progressMax.set(job.id, 100)
    return 100
  }
  if (status === 'failed' || status === 'cancelled') {
    if (job.id) progressMax.delete(job.id)
    return null
  }

  const duration = job.requested_duration && job.requested_duration > 0 ? job.requested_duration : 5
  const expectedMs = Math.max(120_000, duration * 30_000)
  const startedAt = Date.parse(job.created_at)
  const elapsed = Number.isFinite(startedAt) ? Date.now() - startedAt : 0
  const ratio = expectedMs > 0 ? elapsed / expectedMs : 0
  const timeBased = Math.max(status === 'pending' ? 8 : 15, Math.min(60, Math.round(15 + ratio * 45)))
  const backend = typeof job.progress_percent === 'number'
    ? Math.max(0, Math.min(99, Math.round(job.progress_percent)))
    : null
  const next = backend !== null ? Math.max(backend, timeBased) : timeBased
  if (!job.id) return next
  const monotonic = Math.max(progressMax.get(job.id) ?? 0, next)
  progressMax.set(job.id, monotonic)
  return monotonic
}
