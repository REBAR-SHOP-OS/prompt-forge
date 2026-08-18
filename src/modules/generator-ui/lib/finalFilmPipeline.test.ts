import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  awaitUploadWithLateCleanup,
  createFinalFilmPipeline,
  FinalFilmPipelineTimeoutError,
} from './finalFilmPipeline'

afterEach(() => {
  vi.useRealTimers()
})

describe('Final Film pipeline deadline', () => {
  it('aborts an operation when the whole-pipeline deadline expires', async () => {
    vi.useFakeTimers()
    const pipeline = createFinalFilmPipeline(1_000)
    const pending = pipeline.race(new Promise<string>(() => undefined))
    const rejection = expect(pending).rejects.toBeInstanceOf(FinalFilmPipelineTimeoutError)

    await vi.advanceTimersByTimeAsync(1_000)

    await rejection
    expect(pipeline.signal.aborted).toBe(true)
  })

  it('uses the abort reason for an explicit cancellation', async () => {
    const pipeline = createFinalFilmPipeline(10_000)
    const cancelled = new Error('cancelled by user')
    const pending = pipeline.race(new Promise<string>(() => undefined))

    pipeline.controller.abort(cancelled)

    await expect(pending).rejects.toBe(cancelled)
    pipeline.finish()
  })

  it('removes a late upload that completes after timeout', async () => {
    vi.useFakeTimers()
    const pipeline = createFinalFilmPipeline(1_000)
    let resolveUpload!: (result: { error: null }) => void
    const upload = new Promise<{ error: null }>((resolve) => { resolveUpload = resolve })
    const cleanup = vi.fn(async () => undefined)
    const pending = awaitUploadWithLateCleanup(upload, pipeline.race, cleanup)
    const rejection = expect(pending).rejects.toBeInstanceOf(FinalFilmPipelineTimeoutError)

    await vi.advanceTimersByTimeAsync(1_000)
    await rejection

    resolveUpload({ error: null })
    await vi.runAllTimersAsync()
    await Promise.resolve()
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('does not clean up a successful on-time upload', async () => {
    const pipeline = createFinalFilmPipeline(10_000)
    const cleanup = vi.fn(async () => undefined)

    await expect(awaitUploadWithLateCleanup(
      Promise.resolve({ error: null }),
      pipeline.race,
      cleanup,
    )).resolves.toEqual({ error: null })
    expect(cleanup).not.toHaveBeenCalled()
    pipeline.finish()
  })
})
