import { describe, expect, it, vi } from 'vitest'
import {
  requireThirtySecondHandoff,
  requireThirtySecondScenePlan,
  SequentialContinuityError,
} from './thirtySecondContinuity'

describe('30-second sequential continuity', () => {
  it('uses clip 1 completed final-frame URL as clip 2 start frame', async () => {
    const waitForLastFrameUrl = vi.fn().mockResolvedValue('https://frames.test/clip-1-final.png')

    await expect(
      requireThirtySecondHandoff({
        durationSeconds: 30,
        sceneIndex: 1,
        previousJobId: 'clip-1-job',
        waitForLastFrameUrl,
      }),
    ).resolves.toBe('https://frames.test/clip-1-final.png')

    expect(waitForLastFrameUrl).toHaveBeenCalledOnce()
    expect(waitForLastFrameUrl).toHaveBeenCalledWith('clip-1-job', 'Scene 1')
  })

  it('fails clearly instead of queueing clip 2 when the completed handoff is unavailable', async () => {
    const waitForLastFrameUrl = vi.fn().mockRejectedValue(new Error('last-frame capture failed'))

    await expect(
      requireThirtySecondHandoff({
        durationSeconds: 30,
        sceneIndex: 1,
        previousJobId: 'clip-1-job',
        waitForLastFrameUrl,
      }),
    ).rejects.toMatchObject({
      name: 'SequentialContinuityError',
      message:
        'Scene 2 was not queued: the completed end state of Scene 1 could not be used for continuity. No fallback clip was generated.',
    })
  })

  it('rejects an incomplete 30-second scene plan instead of repeating one 15-second prompt', () => {
    expect(() => requireThirtySecondScenePlan(30, ['only one scene'])).toThrow(
      new SequentialContinuityError(
        'The 30-second scenario did not produce exactly two connected scenes. No clips were queued; try again.',
      ),
    )
  })

  it('does not change short-duration scene handling', () => {
    const scenes = ['single short clip']
    expect(requireThirtySecondScenePlan(15, scenes)).toBe(scenes)
  })
})
