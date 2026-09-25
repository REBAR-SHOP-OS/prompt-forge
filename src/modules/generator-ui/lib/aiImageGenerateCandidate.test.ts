import { describe, expect, it, vi } from 'vitest'
import { decideFinalImage, isIdentitySafe } from '../../../../supabase/functions/ai-image-generate/candidate'
import { generateQualityCheckedPreviewShot } from './previewShotQuality'

const identityOkActionFail = {
  perReference: [{ present: true, match: true, reason: 'same product' }],
  actionQuality: { passed: false, reason: 'clamp fused with rebar' },
  passed: false,
}
const identityMismatch = {
  perReference: [{ present: true, match: false, reason: 'ring lacks perforated texture' }],
  actionQuality: { passed: false, reason: 'bar passes through clamp' },
  passed: false,
}

describe('ai-image-generate identity-safe candidate decision', () => {
  it('(a) identity pass + action fail returns retained candidate with non-fatal warning', () => {
    expect(isIdentitySafe(identityOkActionFail, 1)).toBe(true)
    const d = decideFinalImage({ passedDataUrl: null, identitySafeCandidate: { dataUrl: 'img-2', outcome: identityOkActionFail } })
    expect(d).toMatchObject({ kind: 'accept-with-warning', dataUrl: 'img-2', review: { identityPassed: true, actionQualityPassed: false } })
    if (d.kind === 'accept-with-warning') expect(d.review.warning).toContain('clamp fused with rebar')
  })

  it('(b) identity mismatch never yields a candidate and rejects', () => {
    expect(isIdentitySafe(identityMismatch, 1)).toBe(false)
    expect(isIdentitySafe(null, 1)).toBe(false)
    expect(isIdentitySafe({ ...identityOkActionFail, perReference: [] }, 1)).toBe(false)
    expect(decideFinalImage({ passedDataUrl: null, identitySafeCandidate: null })).toEqual({ kind: 'reject' })
  })

  it('(c) a later full pass wins over a retained candidate', () => {
    expect(decideFinalImage({ passedDataUrl: 'img-3', identitySafeCandidate: { dataUrl: 'img-1', outcome: identityOkActionFail } }))
      .toEqual({ kind: 'accept', dataUrl: 'img-3', review: null })
  })

  it('(d) wizard quality loop reaches the outer evaluator with the returned candidate', async () => {
    const generate = vi.fn(async () => 'staged-candidate')
    const criterion = { passed: true, reason: 'ok' }
    const evaluate = vi.fn(async () => ({
      passed: true, summary: 'ok', physicalPlausibility: criterion, productRelevance: criterion,
      surroundingContinuity: criterion, plannedActionFaithfulness: criterion, contradiction: '',
    }))
    const ctx = { shotIndex: 0, totalShots: 1, plannedAction: 'a', previousPlannedAction: '', nextPlannedAction: '', productName: 'p' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await generateQualityCheckedPreviewShot(ctx as any, generate, evaluate as any)
    expect(evaluate).toHaveBeenCalledWith('staged-candidate', ctx)
    expect(r.imageUrl).toBe('staged-candidate')
  })
})
