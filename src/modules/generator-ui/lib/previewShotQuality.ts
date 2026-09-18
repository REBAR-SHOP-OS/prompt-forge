export type PreviewShotCriterion = {
  passed: boolean
  reason: string
}

export type PreviewShotQualityEvaluation = {
  physicalPlausibility: PreviewShotCriterion
  productRelevance: PreviewShotCriterion
  surroundingContinuity: PreviewShotCriterion
  plannedActionFaithfulness: PreviewShotCriterion
  contradiction: string | null
  summary: string
  passed: boolean
}

export type PreviewShotContext = {
  shotIndex: number
  totalShots: number
  plannedAction: string
  previousPlannedAction?: string
  nextPlannedAction?: string
  productName?: string
}

export const MAX_PREVIEW_SHOT_ATTEMPTS = 3

export class PreviewShotQualityError extends Error {
  constructor(message: string, readonly imageUrl: string) {
    super(message)
    this.name = 'PreviewShotQualityError'
  }
}

export class PreviewShotVerificationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'PreviewShotVerificationError'
  }
}

function retryInstruction(evaluation: PreviewShotQualityEvaluation): string {
  const reasons = [
    evaluation.physicalPlausibility,
    evaluation.productRelevance,
    evaluation.surroundingContinuity,
    evaluation.plannedActionFaithfulness,
  ]
    .filter((criterion) => !criterion.passed)
    .map((criterion) => criterion.reason.trim())
    .filter(Boolean)
  if (evaluation.contradiction?.trim()) reasons.push(evaluation.contradiction.trim())

  return [
    'QUALITY CORRECTION: regenerate this same planned shot, not a new story.',
    'Make the visible instant physically plausible, clearly centered on the selected product, coherent with the neighboring plans, and unmistakably faithful to the planned action.',
    reasons.length > 0 ? `Correct these observed problems: ${reasons.join(' ')}` : '',
  ].filter(Boolean).join(' ')
}

export async function generateQualityCheckedPreviewShot(
  context: PreviewShotContext,
  generate: (correction?: string) => Promise<string>,
  evaluate: (imageUrl: string, context: PreviewShotContext) => Promise<PreviewShotQualityEvaluation>,
  maxAttempts = MAX_PREVIEW_SHOT_ATTEMPTS,
): Promise<{ imageUrl: string; evaluation: PreviewShotQualityEvaluation; attempts: number }> {
  const attemptsLimit = Math.max(1, Math.floor(maxAttempts))
  let correction: string | undefined
  let lastEvaluation: PreviewShotQualityEvaluation | null = null
  let lastImageUrl = ''

  for (let attempt = 1; attempt <= attemptsLimit; attempt += 1) {
    const imageUrl = await generate(correction)
    lastImageUrl = imageUrl
    let evaluation: PreviewShotQualityEvaluation
    try {
      evaluation = await evaluate(imageUrl, context)
    } catch (error) {
      throw new PreviewShotVerificationError(
        `Could not verify preview shot ${context.shotIndex + 1}. It was not regenerated automatically.`,
        error,
      )
    }
    lastEvaluation = evaluation
    if (evaluation.passed) return { imageUrl, evaluation, attempts: attempt }
    if (attempt < attemptsLimit) correction = retryInstruction(evaluation)
  }

  const detail = lastEvaluation?.summary.trim() || lastEvaluation?.contradiction?.trim() || 'The image did not match its planned action.'
  throw new PreviewShotQualityError(
    `Preview shot ${context.shotIndex + 1} still failed action-quality review after ${attemptsLimit} attempts. ${detail} Regenerate this shot to try again.`,
    lastImageUrl,
  )
}
