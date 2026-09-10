import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/core/api/client'
import {
  GlobalSceneBatchError,
  queueSceneBatch,
  queueSequentialSceneBatch,
  waitForSceneBatch,
} from '@/modules/generator-ui/lib/sceneBatch'

describe('queueSceneBatch', () => {
  it('keeps successful jobs and queues scene 3 after scene 2 fails', async () => {
    const queued: number[] = []
    const failures: number[] = []
    const result = await queueSceneBatch(
      ['scene 1', 'scene 2', 'scene 3'],
      async (_scene, sceneIndex) => {
        queued.push(sceneIndex)
        if (sceneIndex === 1) throw new Error('provider rejected scene 2')
        return `job-${sceneIndex + 1}`
      },
      (failure) => failures.push(failure.sceneIndex),
    )

    expect(queued).toEqual([0, 1, 2])
    expect(result.jobIds).toEqual(['job-1', 'job-3'])
    expect(result.failed).toEqual([{ sceneIndex: 1, message: 'provider rejected scene 2' }])
    expect(failures).toEqual([1])
  })

  it('surfaces global auth and billing failures with already queued jobs', async () => {
    await expect(queueSceneBatch(
      ['scene 1', 'scene 2', 'scene 3'],
      async (_scene, sceneIndex) => {
        if (sceneIndex === 1) throw new ApiError(402, 'INSUFFICIENT_CREDITS', 'No credits')
        return `job-${sceneIndex + 1}`
      },
    )).rejects.toMatchObject<Partial<GlobalSceneBatchError>>({
      name: 'GlobalSceneBatchError',
      partial: { jobIds: ['job-1'], failed: [] },
    })
  })
})

describe('queueSequentialSceneBatch', () => {
  it('waits for each completed card and hands its actual last frame to the next card', async () => {
    const events: string[] = []

    const jobIds = await queueSequentialSceneBatch(
      ['scene 1', 'scene 2', 'scene 3'],
      async (_scene, sceneIndex, previousLastFrameUrl) => {
        events.push(`queue:${sceneIndex + 1}:${previousLastFrameUrl ?? 'none'}`)
        return `job-${sceneIndex + 1}`
      },
      async (jobId, sceneIndex) => {
        events.push(`wait:${jobId}`)
        return `https://frames.test/card-${sceneIndex + 1}-last.png`
      },
    )

    expect(jobIds).toEqual(['job-1', 'job-2', 'job-3'])
    expect(events).toEqual([
      'queue:1:none',
      'wait:job-1',
      'queue:2:https://frames.test/card-1-last.png',
      'wait:job-2',
      'queue:3:https://frames.test/card-2-last.png',
    ])
  })

  it('reports every job it queued even when the chain then fails', async () => {
    // A 30s+ film aborts on the first failed handoff. The clips queued before
    // that point are real: rendering, already in the clip list, already
    // billing. Without onJobQueued the caller's only record is the array it
    // never receives, and the operator is told nothing queued.
    const queued: string[] = []

    await expect(queueSequentialSceneBatch(
      ['scene 1', 'scene 2', 'scene 3'],
      async (_scene, sceneIndex) => `job-${sceneIndex + 1}`,
      async (jobId) => {
        if (jobId === 'job-2') throw new Error('last-frame capture failed')
        return 'https://frames.test/last.png'
      },
      (jobId) => { queued.push(jobId) },
    )).rejects.toThrow('last-frame capture failed')

    expect(queued).toEqual(['job-1', 'job-2'])
  })

  it('fires onJobQueued before the wait, not after', async () => {
    const events: string[] = []

    await queueSequentialSceneBatch(
      ['scene 1', 'scene 2'],
      async (_scene, sceneIndex) => `job-${sceneIndex + 1}`,
      async (jobId) => { events.push(`wait:${jobId}`); return 'https://frames.test/last.png' },
      (jobId) => { events.push(`queued:${jobId}`) },
    )

    expect(events).toEqual(['queued:job-1', 'wait:job-1', 'queued:job-2'])
  })

  it('does not queue a later card when the required last-frame handoff fails', async () => {
    const queueScene = vi.fn(async (_scene: string, sceneIndex: number) => `job-${sceneIndex + 1}`)

    await expect(queueSequentialSceneBatch(
      ['scene 1', 'scene 2', 'scene 3'],
      queueScene,
      async () => { throw new Error('last-frame capture failed') },
    )).rejects.toThrow('last-frame capture failed')

    expect(queueScene).toHaveBeenCalledTimes(1)
    expect(queueScene).toHaveBeenCalledWith('scene 1', 0, undefined)
  })
})

describe('waitForSceneBatch', () => {
  it('reports completed, failed, and timed-out pending jobs separately', async () => {
    let now = 0
    const attempts = new Map<string, number>()
    const settled: string[] = []
    const result = await waitForSceneBatch(
      ['job-1', 'job-2', 'job-3'],
      async (id) => {
        attempts.set(id, (attempts.get(id) ?? 0) + 1)
        if (id === 'job-1') return { id, status: 'completed', video: { storage_path: 'one.mp4' } }
        if (id === 'job-2') return { id, status: 'failed', video: null }
        return { id, status: 'processing', video: null }
      },
      {
        timeoutMs: 20,
        pollIntervalMs: 10,
        now: () => now,
        sleep: async (ms) => { now += ms },
        onSettled: (job) => settled.push(job.id),
      },
    )

    expect(result).toEqual({ completed: ['job-1'], failed: ['job-2'], pending: ['job-3'] })
    expect(settled).toEqual(['job-1', 'job-2'])
    expect(attempts.get('job-3')).toBe(2)
  })

  it('retries transient poll errors without polling forever', async () => {
    let now = 0
    const getJob = vi.fn()
      .mockRejectedValueOnce(new Error('temporary network error'))
      .mockResolvedValueOnce({ id: 'job-1', status: 'completed', video: { storage_path: 'one.mp4' } })

    const result = await waitForSceneBatch(['job-1'], getJob, {
      timeoutMs: 20,
      pollIntervalMs: 10,
      now: () => now,
      sleep: async (ms) => { now += ms },
    })

    expect(result).toEqual({ completed: ['job-1'], failed: [], pending: [] })
    expect(getJob).toHaveBeenCalledTimes(2)
  })
})
