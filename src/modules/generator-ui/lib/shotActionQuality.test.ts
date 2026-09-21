import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  evaluateShotActionQualityBatch,
  type ShotActionQualityEvaluation,
} from './shotActionQuality'

const passingEvaluation: ShotActionQualityEvaluation = {
  physicalPlausibility: { passed: true, reason: 'Motion and contact are physically coherent.' },
  productRelevance: { passed: true, reason: 'The visible action demonstrates the selected product.' },
  surroundingContinuity: { passed: true, reason: 'The state connects to both neighboring shots.' },
  plannedActionFaithfulness: { passed: true, reason: 'The observed action matches the plan.' },
  contradiction: null,
  summary: 'The shot performs the planned product behavior.',
  passed: true,
}

const scenes = [
  'The worker lifts the stirrup from the bench.',
  'The worker inspects the stirrup bend.',
  'The worker installs the stirrup in the cage.',
]

const candidates = scenes.map((_, shotIndex) => ({
  jobId: `job-${shotIndex + 1}`,
  shotIndex,
  videoUrl: `https://project.supabase.co/storage/v1/object/sign/videos/shot-${shotIndex + 1}.mp4`,
}))

describe('Make Full Film per-shot action quality', () => {
  it('accepts valid observed behavior and sends the planned neighboring actions', async () => {
    const evaluate = vi.fn(async () => passingEvaluation)
    const batch = await evaluateShotActionQualityBatch(scenes, candidates, evaluate, 'Rebar stirrup')

    expect(batch.allPassed).toBe(true)
    expect(batch.passedJobIds).toEqual(['job-1', 'job-2', 'job-3'])
    expect(batch.blocked).toEqual([])
    expect(evaluate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      shotIndex: 1,
      plannedAction: scenes[1],
      previousPlannedAction: scenes[0],
      nextPlannedAction: scenes[2],
      productName: 'Rebar stirrup',
    }))
  })

  it('rejects invalid physical behavior even though the video rendered successfully', async () => {
    const invalid = {
      ...passingEvaluation,
      physicalPlausibility: { passed: false, reason: 'The product floats through the worker hand.' },
    }
    const batch = await evaluateShotActionQualityBatch(scenes, [candidates[0]], async () => invalid)

    expect(batch.allPassed).toBe(false)
    expect(batch.passedJobIds).toEqual([])
    expect(batch.blocked[0]).toMatchObject({ jobId: 'job-1', shotIndex: 0, status: 'failed' })
  })

  it('rejects a plan or continuity contradiction even if all four raw booleans say pass', async () => {
    const contradictory = {
      ...passingEvaluation,
      contradiction: 'The stirrup is already installed although the next planned shot installs it.',
      passed: true,
    }
    const batch = await evaluateShotActionQualityBatch(scenes, [candidates[1]], async () => contradictory)

    expect(batch.allPassed).toBe(false)
    expect(batch.blocked[0].evaluation?.passed).toBe(false)
    expect(batch.blocked[0].evaluation?.contradiction).toContain('next planned shot')
  })

  it('isolates one failed shot while preserving passing shots and evaluating every candidate', async () => {
    const evaluate = vi.fn(async (request: { shotIndex: number }) => {
      if (request.shotIndex === 1) {
        return {
          ...passingEvaluation,
          productRelevance: { passed: false, reason: 'The worker handles an unrelated object.' },
        }
      }
      return passingEvaluation
    })
    const batch = await evaluateShotActionQualityBatch(scenes, candidates, evaluate)

    expect(evaluate).toHaveBeenCalledTimes(3)
    expect(batch.passedJobIds).toEqual(['job-1', 'job-3'])
    expect(batch.blocked.map((result) => result.jobId)).toEqual(['job-2'])
    expect(batch.results).toHaveLength(3)
  })

  it('fails closed on an evaluator error instead of treating technical render success as quality success', async () => {
    const batch = await evaluateShotActionQualityBatch(
      scenes,
      [candidates[0]],
      async () => { throw new Error('quality service unavailable') },
    )

    expect(batch.allPassed).toBe(false)
    expect(batch.blocked[0]).toMatchObject({ status: 'error', error: 'quality service unavailable' })
  })

  it('wires actual rendered video URLs into the runtime evaluator before auto-preview', () => {
    const dashboard = readFileSync(
      resolve(process.cwd(), 'src/modules/generator-ui/pages/DashboardPage.tsx'),
      'utf8',
    )
    const qualityCall = dashboard.indexOf("supabase.functions.invoke<{ evaluation?: unknown }>('film-shot-quality'")
    const previewGate = dashboard.indexOf('qualityBatch.allPassed')

    expect(dashboard).toContain('evaluateShotActionQualityBatch(')
    expect(dashboard).toContain('videoUrl: signedVideoUrl')
    expect(qualityCall).toBeGreaterThan(-1)
    expect(previewGate).toBeGreaterThan(qualityCall)
  })
})
