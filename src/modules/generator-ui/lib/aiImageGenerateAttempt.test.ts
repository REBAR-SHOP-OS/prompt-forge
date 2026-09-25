import { describe, expect, it, vi } from 'vitest'
import { decideAttempt } from '../../../../supabase/functions/ai-image-generate/candidate'
import { bytesToBase64, createReferenceResolver } from '../../../../supabase/functions/ai-image-generate/references'

const safeActionFail = {
  perReference: [{ present: true, match: true, reason: 'same' }, { present: true, match: true, reason: 'same' }],
  actionQuality: { passed: false, reason: 'wire passes through bar' },
  passed: false,
}
const mismatch = {
  perReference: [{ present: true, match: false, reason: 'wrong shape' }, { present: true, match: true, reason: 'same' }],
  actionQuality: { passed: false, reason: 'x' },
  passed: false,
}

describe('ai-image-generate per-attempt decision', () => {
  it('identity-safe + action fail returns immediately with nonfatal metadata', () => {
    const d = decideAttempt({ verdict: 'identity-fail', outcome: safeActionFail, dataUrl: 'img', referenceCount: 2 })
    expect(d).toMatchObject({ kind: 'accept-with-warning', dataUrl: 'img', review: { identityPassed: true, actionQualityPassed: false } })
  })
  it('identity mismatch retries (fail-closed path stays 422 after cap)', () => {
    expect(decideAttempt({ verdict: 'identity-fail', outcome: mismatch, dataUrl: 'img', referenceCount: 2 })).toEqual({ kind: 'retry' })
    expect(decideAttempt({ verdict: 'identity-fail', outcome: null, dataUrl: 'img', referenceCount: 2 })).toEqual({ kind: 'retry' })
    expect(decideAttempt({ verdict: 'identity-fail', outcome: safeActionFail, dataUrl: 'img', referenceCount: 3 })).toEqual({ kind: 'retry' })
  })
  it('evaluator error stays an error (502) and full pass accepts', () => {
    expect(decideAttempt({ verdict: 'error', outcome: null, dataUrl: 'img', referenceCount: 2 })).toEqual({ kind: 'error' })
    expect(decideAttempt({ verdict: 'pass', outcome: null, dataUrl: 'img', referenceCount: 2 })).toEqual({ kind: 'accept', review: null })
  })
})

describe('ai-image-generate reference resolution', () => {
  it('resolves each URL once per request, sharing in-flight results', async () => {
    const fetcher = vi.fn(async (u: string) => `data:${u}`)
    const resolve = createReferenceResolver(fetcher)
    const results = await Promise.all([resolve('a'), resolve('a'), resolve('b')])
    for (let i = 0; i < 3; i++) await resolve('a')
    expect(results).toEqual(['data:a', 'data:a', 'data:b'])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('chunked base64 matches the byte-wise encoding across chunk boundaries', () => {
    const bytes = new Uint8Array(0x8000 * 2 + 17).map((_, i) => (i * 31) % 256)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    expect(bytesToBase64(bytes)).toBe(btoa(binary))
    expect(bytesToBase64(new Uint8Array())).toBe('')
  })
})
