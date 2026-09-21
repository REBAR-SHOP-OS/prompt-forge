export type ShotActionCriterion = {
  passed: boolean
  reason: string
}

export type ShotActionQualityEvaluation = {
  physicalPlausibility: ShotActionCriterion
  productRelevance: ShotActionCriterion
  surroundingContinuity: ShotActionCriterion
  plannedActionFaithfulness: ShotActionCriterion
  contradiction: string | null
  summary: string
  passed: boolean
}

export type ShotActionQualityCandidate = {
  jobId: string
  shotIndex: number
  videoUrl: string
}

export type ShotActionQualityResult = {
  jobId: string
  shotIndex: number
  status: 'passed' | 'failed' | 'error'
  evaluation?: ShotActionQualityEvaluation
  error?: string
}

export type ShotActionQualityBatch = {
  results: ShotActionQualityResult[]
  passedJobIds: string[]
  blocked: ShotActionQualityResult[]
  allPassed: boolean
}

export type ShotActionQualityRequest = {
  videoUrl: string
  shotIndex: number
  totalShots: number
  plannedAction: string
  previousPlannedAction?: string
  nextPlannedAction?: string
  productName?: string
}

const CRITERIA = [
  'physicalPlausibility',
  'productRelevance',
  'surroundingContinuity',
  'plannedActionFaithfulness',
] as const

export function normalizeShotActionQualityEvaluation(value: unknown): ShotActionQualityEvaluation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const normalized = {} as Record<(typeof CRITERIA)[number], ShotActionCriterion>
  for (const key of CRITERIA) {
    const raw = record[key]
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const criterion = raw as Record<string, unknown>
    if (typeof criterion.passed !== 'boolean' || typeof criterion.reason !== 'string') return null
    normalized[key] = { passed: criterion.passed, reason: criterion.reason.trim() }
  }
  if (!(record.contradiction === null || typeof record.contradiction === 'string')) return null
  if (typeof record.summary !== 'string') return null
  const contradiction = typeof record.contradiction === 'string' && record.contradiction.trim()
    ? record.contradiction.trim()
    : null
  const passed = CRITERIA.every((key) => normalized[key].passed) && contradiction === null
  return {
    physicalPlausibility: normalized.physicalPlausibility,
    productRelevance: normalized.productRelevance,
    surroundingContinuity: normalized.surroundingContinuity,
    plannedActionFaithfulness: normalized.plannedActionFaithfulness,
    contradiction,
    summary: record.summary.trim(),
    passed,
  }
}

/**
 * Evaluate every technically completed shot independently. A model/API error is
 * fail-closed as `error`, never converted into a quality pass. Results preserve
 * shot order and never mutate, discard, or re-run passing jobs, so one blocked
 * shot can be corrected without invalidating its neighbors.
 */
export async function evaluateShotActionQualityBatch(
  scenes: string[],
  candidates: ShotActionQualityCandidate[],
  evaluate: (request: ShotActionQualityRequest) => Promise<unknown>,
  productName?: string | null,
): Promise<ShotActionQualityBatch> {
  const results: ShotActionQualityResult[] = []

  for (const candidate of [...candidates].sort((a, b) => a.shotIndex - b.shotIndex)) {
    try {
      const raw = await evaluate({
        videoUrl: candidate.videoUrl,
        shotIndex: candidate.shotIndex,
        totalShots: scenes.length,
        plannedAction: scenes[candidate.shotIndex] ?? '',
        previousPlannedAction: candidate.shotIndex > 0 ? scenes[candidate.shotIndex - 1] : undefined,
        nextPlannedAction: candidate.shotIndex + 1 < scenes.length ? scenes[candidate.shotIndex + 1] : undefined,
        productName: productName?.trim() || undefined,
      })
      const evaluation = normalizeShotActionQualityEvaluation(raw)
      if (!evaluation) {
        results.push({
          jobId: candidate.jobId,
          shotIndex: candidate.shotIndex,
          status: 'error',
          error: 'Shot quality evaluator returned an invalid response.',
        })
        continue
      }
      results.push({
        jobId: candidate.jobId,
        shotIndex: candidate.shotIndex,
        status: evaluation.passed ? 'passed' : 'failed',
        evaluation,
      })
    } catch (error) {
      results.push({
        jobId: candidate.jobId,
        shotIndex: candidate.shotIndex,
        status: 'error',
        error: error instanceof Error ? error.message : 'Shot quality evaluation failed.',
      })
    }
  }

  const passedJobIds = results.filter((result) => result.status === 'passed').map((result) => result.jobId)
  const blocked = results.filter((result) => result.status !== 'passed')
  return {
    results,
    passedJobIds,
    blocked,
    allPassed: results.length > 0 && blocked.length === 0,
  }
}
