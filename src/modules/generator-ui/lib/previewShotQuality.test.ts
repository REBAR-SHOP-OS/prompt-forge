import { describe, expect, it, vi } from 'vitest'
import {
  generateQualityCheckedPreviewShot,
  PreviewShotQualityError,
  PreviewShotVerificationError,
  type PreviewShotQualityEvaluation,
} from './previewShotQuality'

const context = {
  shotIndex: 1,
  totalShots: 3,
  plannedAction: 'The worker fastens crossing bars with the selected tie wire.',
  previousPlannedAction: 'The worker positions the bars.',
  nextPlannedAction: 'The camera reveals the completed cage.',
  productName: 'Tie wire',
}

function evaluation(passed: boolean, summary = passed ? 'Pass.' : 'The hands do not contact the wire.'): PreviewShotQualityEvaluation {
  const criterion = { passed: true, reason: 'Looks correct.' }
  return {
    physicalPlausibility: passed ? criterion : { passed: false, reason: 'The hands do not contact the wire.' },
    productRelevance: criterion,
    surroundingContinuity: criterion,
    plannedActionFaithfulness: criterion,
    contradiction: null,
    summary,
    passed,
  }
}

describe('generateQualityCheckedPreviewShot', () => {
  it('accepts a visually verified shot without regeneration', async () => {
    const generate = vi.fn(async () => 'https://preview/one.png')
    const evaluate = vi.fn(async () => evaluation(true))

    await expect(generateQualityCheckedPreviewShot(context, generate, evaluate)).resolves.toMatchObject({
      imageUrl: 'https://preview/one.png',
      attempts: 1,
    })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(evaluate).toHaveBeenCalledWith('https://preview/one.png', context)
  })

  it('regenerates only the failed shot with a bounded quality correction', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce('https://preview/failed.png')
      .mockResolvedValueOnce('https://preview/passed.png')
    const evaluate = vi.fn()
      .mockResolvedValueOnce(evaluation(false))
      .mockResolvedValueOnce(evaluation(true))

    const result = await generateQualityCheckedPreviewShot(context, generate, evaluate)

    expect(result.imageUrl).toBe('https://preview/passed.png')
    expect(result.attempts).toBe(2)
    expect(generate).toHaveBeenCalledTimes(2)
    expect(generate.mock.calls[1][0]).toContain('regenerate this same planned shot, not a new story')
    expect(generate.mock.calls[1][0]).toContain('hands do not contact the wire')
  })

  it('fails explicitly after the bounded attempts remain implausible', async () => {
    let attempt = 0
    const generate = vi.fn(async () => `https://preview/failed-${++attempt}.png`)
    const evaluate = vi.fn(async () => evaluation(false))

    await expect(generateQualityCheckedPreviewShot(context, generate, evaluate, 3)).rejects.toMatchObject({
      name: 'PreviewShotQualityError',
      message: 'Preview shot 2 still failed action-quality review after 3 attempts. The hands do not contact the wire. Regenerate this shot to try again.',
      imageUrl: 'https://preview/failed-3.png',
    } satisfies Partial<PreviewShotQualityError>)
    expect(generate).toHaveBeenCalledTimes(3)
  })

  it('retains the generated image without spending another generation when the evaluator fails', async () => {
    const generate = vi.fn(async () => 'https://preview/unverified.png')
    const evaluatorError = new Error('gateway unavailable')
    const evaluate = vi.fn(async () => { throw evaluatorError })

    await expect(generateQualityCheckedPreviewShot(context, generate, evaluate)).rejects.toMatchObject({
      name: 'PreviewShotVerificationError',
      imageUrl: 'https://preview/unverified.png',
      cause: evaluatorError,
      message: expect.stringContaining('generated image is kept for review'),
    } satisfies Partial<PreviewShotVerificationError>)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('retains the previous identity-safe image when a correction generation fails identity validation', async () => {
    const identityError = new Error('Image identity/action-quality review failed in the edited image.')
    const generate = vi.fn()
      .mockResolvedValueOnce('https://preview/identity-safe.png')
      .mockRejectedValueOnce(identityError)
    const evaluate = vi.fn(async () => evaluation(false))

    await expect(generateQualityCheckedPreviewShot(context, generate, evaluate)).rejects.toMatchObject({
      name: 'PreviewShotVerificationError',
      imageUrl: 'https://preview/identity-safe.png',
      cause: identityError,
      message: identityError.message,
    } satisfies Partial<PreviewShotVerificationError>)
    expect(generate).toHaveBeenCalledTimes(2)
    expect(evaluate).toHaveBeenCalledTimes(1)
  })

  it('keeps a first-attempt identity failure explicit without inventing a retained image', async () => {
    const identityError = new Error('Image identity/action-quality review failed in the edited image.')
    const generate = vi.fn(async () => { throw identityError })
    const evaluate = vi.fn(async () => evaluation(true))

    await expect(generateQualityCheckedPreviewShot(context, generate, evaluate)).rejects.toBe(identityError)
    expect(evaluate).not.toHaveBeenCalled()
  })
})
