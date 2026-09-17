import { afterEach, describe, expect, it, vi } from 'vitest'
import { getJobProgressPercent, isTerminalStatus } from './jobProgress'

describe('job progress helpers', () => {
  afterEach(() => vi.useRealTimers())

  it('preserves the Dashboard fallback that normalizes unknown statuses to pending', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z'))

    expect(getJobProgressPercent({
      id: 'unknown-status',
      status: 'provider-specific',
      progress_percent: null,
      created_at: '2026-09-17T13:00:00Z',
      requested_duration: 5,
    })).toBe(8)
  })

  it('keeps terminal semantics and monotonic backend progress', () => {
    expect(isTerminalStatus('completed')).toBe(true)
    expect(isTerminalStatus('processing')).toBe(false)
    expect(getJobProgressPercent({
      id: 'job-1',
      status: 'processing',
      progress_percent: 42,
      created_at: new Date().toISOString(),
    })).toBe(42)
    expect(getJobProgressPercent({
      id: 'job-1',
      status: 'processing',
      progress_percent: 20,
      created_at: new Date().toISOString(),
    })).toBe(42)
    expect(getJobProgressPercent({
      id: 'job-1',
      status: 'completed',
      created_at: new Date().toISOString(),
    })).toBe(100)
  })
})
