import { describe, expect, it, vi } from 'vitest'
import { runIdentityCheckedEdit } from '../../../../supabase/functions/ai-image-edit/identity-retry'

const mismatch = {
  perReference: [
    { present: true, match: true, reason: 'same product' },
    { present: true, match: false, reason: 'different character' },
  ],
  passed: false,
}

describe('ai-image-edit identity retry policy', () => {
  it('accepts product+character only when both references pass', async () => {
    const generate = vi.fn(async () => ({ kind: 'success' as const, dataUrl: 'output-1' }))
    const evaluate = vi.fn(async () => ({
      verdict: 'pass' as const,
      outcome: {
        perReference: [
          { present: true, match: true, reason: 'same product' },
          { present: true, match: true, reason: 'same character' },
        ],
        passed: true,
      },
    }))

    await expect(runIdentityCheckedEdit({ referenceCount: 2, maxAttempts: 2, generate, evaluate }))
      .resolves.toEqual({ kind: 'success', dataUrl: 'output-1' })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(evaluate).toHaveBeenCalledWith('output-1')
  })

  it('retries only identity mismatch and stops at the configured limit', async () => {
    const generate = vi.fn(async (attempt: number) => ({ kind: 'success' as const, dataUrl: `output-${attempt}` }))
    const evaluate = vi.fn(async () => ({ verdict: 'identity-fail' as const, outcome: mismatch }))

    const result = await runIdentityCheckedEdit({ referenceCount: 2, maxAttempts: 2, generate, evaluate })

    expect(result).toMatchObject({ kind: 'error', status: 422, outcome: mismatch })
    expect(generate).toHaveBeenCalledTimes(2)
    expect(evaluate).toHaveBeenCalledTimes(2)
  })

  it.each([
    [402, 'AI credits exhausted'],
    [429, 'Identity evaluator rate limit reached'],
    [502, 'Identity evaluator gateway error'],
  ])('returns evaluator HTTP %s without generating again', async (status, error) => {
    const generate = vi.fn(async () => ({ kind: 'success' as const, dataUrl: 'output-1' }))
    const evaluate = vi.fn(async () => ({ verdict: 'error' as const, outcome: null, status, error }))

    await expect(runIdentityCheckedEdit({ referenceCount: 2, maxAttempts: 2, generate, evaluate }))
      .resolves.toMatchObject({ kind: 'error', status, error })
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('returns generation gateway errors without evaluation or extra generation', async () => {
    const generate = vi.fn(async () => ({ kind: 'error' as const, status: 502, error: 'AI gateway error' }))
    const evaluate = vi.fn()

    await expect(runIdentityCheckedEdit({ referenceCount: 2, maxAttempts: 2, generate, evaluate }))
      .resolves.toEqual({ kind: 'error', status: 502, error: 'AI gateway error' })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(evaluate).not.toHaveBeenCalled()
  })
})
