import { describe, expect, it } from 'vitest'
import type { JobDetail } from '@/modules/job-orchestrator/contract'
import {
  autoFilmPreviewReducer,
  createAutoFilmBatchId,
  createAutoFilmPreviewState,
  summarizeAutoFilmBatch,
} from './autoFilmPreview'

function job(id: string, status: JobDetail['status'], playable = false): JobDetail {
  return {
    id,
    status,
    input_prompt: `Scene ${id}`,
    provider_key: 'test',
    model_key: 'test',
    created_at: '2026-08-18T00:00:00.000Z',
    updated_at: '2026-08-18T00:00:00.000Z',
    video: playable
      ? {
          id: `video-${id}`,
          storage_path: `clips/${id}.mp4`,
          thumbnail_url: null,
          aspect_ratio: '16:9',
          duration: 15,
        }
      : null,
  }
}

describe('Make Full Film automatic Preview', () => {
  it('keeps all successful clips in scenario order', () => {
    const ids = ['scene-1', 'scene-2', 'scene-3']
    const settled = new Map([
      ['scene-3', job('scene-3', 'completed', true)],
      ['scene-1', job('scene-1', 'completed', true)],
      ['scene-2', job('scene-2', 'completed', true)],
    ])

    const result = summarizeAutoFilmBatch(ids, settled, new Set())

    expect(result.completed.map((clip) => clip.id)).toEqual(ids)
    expect(result.failed).toEqual([])
    expect(result.pending).toEqual([])
  })

  it('keeps successful clips and reports failed and pending scenes separately', () => {
    const ids = ['scene-1', 'scene-2', 'scene-3']
    const settled = new Map([
      ['scene-1', job('scene-1', 'completed', true)],
      ['scene-2', job('scene-2', 'failed')],
    ])

    const result = summarizeAutoFilmBatch(ids, settled, new Set(['scene-3']))

    expect(result.completed.map((clip) => clip.id)).toEqual(['scene-1'])
    expect(result.failed.map((clip) => clip.id)).toEqual(['scene-2'])
    expect(result.pending).toEqual(['scene-3'])
  })

  it('opens each batch exactly once across repeated settled events and renders', () => {
    const clip = job('scene-1', 'completed', true)
    const batchId = createAutoFilmBatchId([clip.id])
    const opened = autoFilmPreviewReducer(createAutoFilmPreviewState(), {
      type: 'batch-settled',
      batchId,
      clips: [clip],
    })

    const repeated = autoFilmPreviewReducer(opened, {
      type: 'batch-settled',
      batchId,
      clips: [clip],
    })

    expect(repeated).toBe(opened)
    expect(repeated.active?.batchId).toBe(batchId)
    expect(repeated.consumedBatchIds).toEqual([batchId])
  })

  it('stays dismissed until a different batch settles', () => {
    const first = job('scene-1', 'completed', true)
    const firstId = createAutoFilmBatchId([first.id])
    const opened = autoFilmPreviewReducer(createAutoFilmPreviewState(), {
      type: 'batch-settled',
      batchId: firstId,
      clips: [first],
    })
    const dismissed = autoFilmPreviewReducer(opened, { type: 'dismiss' })
    const stalePoll = autoFilmPreviewReducer(dismissed, {
      type: 'batch-settled',
      batchId: firstId,
      clips: [first],
    })
    const second = job('scene-2', 'completed', true)
    const next = autoFilmPreviewReducer(stalePoll, {
      type: 'batch-settled',
      batchId: createAutoFilmBatchId([second.id]),
      clips: [second],
    })

    expect(stalePoll.active).toBeNull()
    expect(next.active?.clips.map((clip) => clip.id)).toEqual(['scene-2'])
  })

  it('clears the active batch on Start Over without clearing its consumed guard', () => {
    const clip = job('scene-1', 'completed', true)
    const batchId = createAutoFilmBatchId([clip.id])
    const opened = autoFilmPreviewReducer(createAutoFilmPreviewState(), {
      type: 'batch-settled',
      batchId,
      clips: [clip],
    })

    const reset = autoFilmPreviewReducer(opened, { type: 'clear-active' })
    const stalePoll = autoFilmPreviewReducer(reset, {
      type: 'batch-settled',
      batchId,
      clips: [clip],
    })

    expect(reset.active).toBeNull()
    expect(reset.consumedBatchIds).toEqual([batchId])
    expect(stalePoll).toBe(reset)
  })

  it('lets manual Preview discard the active auto batch while keeping it exactly-once', () => {
    const clip = job('scene-1', 'completed', true)
    const batchId = createAutoFilmBatchId([clip.id])
    const opened = autoFilmPreviewReducer(createAutoFilmPreviewState(), {
      type: 'batch-settled',
      batchId,
      clips: [clip],
    })

    const manualPreview = autoFilmPreviewReducer(opened, { type: 'clear-active' })

    expect(manualPreview.active).toBeNull()
    expect(manualPreview.consumedBatchIds).toEqual([batchId])
  })

  it('starts closed on hydration and does not infer a batch from old clips', () => {
    const hydrated = createAutoFilmPreviewState()

    expect(hydrated.active).toBeNull()
    expect(hydrated.consumedBatchIds).toEqual([])
  })

  it('does not open when a settled batch has no playable clips', () => {
    const state = autoFilmPreviewReducer(createAutoFilmPreviewState(), {
      type: 'batch-settled',
      batchId: createAutoFilmBatchId(['failed']),
      clips: [],
    })

    expect(state.active).toBeNull()
    expect(state.consumedBatchIds).toEqual([])
  })
})
