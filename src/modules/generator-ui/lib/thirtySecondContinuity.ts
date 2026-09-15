export const THIRTY_SECOND_SCENE_COUNT = 2

export class SequentialContinuityError extends Error {
  readonly cause: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'SequentialContinuityError'
    this.cause = cause
  }
}

/**
 * A 30-second composer film must have exactly two connected 15-second scenes.
 * Rejecting an incomplete plan prevents the legacy repeated-prompt fallback.
 */
export function requireThirtySecondScenePlan(
  durationSeconds: number,
  scenes: string[],
): string[] {
  if (durationSeconds !== 30) return scenes

  const normalizedScenes = scenes.map((scene) => scene.trim()).filter(Boolean)
  if (normalizedScenes.length !== THIRTY_SECOND_SCENE_COUNT) {
    throw new SequentialContinuityError(
      'The 30-second scenario did not produce exactly two connected scenes. No clips were queued; try again.',
    )
  }

  return normalizedScenes
}

interface ThirtySecondHandoffOptions {
  durationSeconds: number
  sceneIndex: number
  previousJobId: string | null
  waitForLastFrameUrl: (previousJobId: string, sceneLabel: string) => Promise<string>
}

/**
 * Resolve clip 2 from clip 1's completed final visual state. This deliberately
 * has no original-start-frame fallback: an unavailable handoff aborts clip 2.
 */
export async function requireThirtySecondHandoff({
  durationSeconds,
  sceneIndex,
  previousJobId,
  waitForLastFrameUrl,
}: ThirtySecondHandoffOptions): Promise<string | undefined> {
  if (durationSeconds !== 30 || sceneIndex === 0) return undefined

  const previousSceneNumber = sceneIndex
  const currentSceneNumber = sceneIndex + 1
  if (!previousJobId) {
    throw new SequentialContinuityError(
      `Scene ${currentSceneNumber} was not queued: Scene ${previousSceneNumber} has no completed continuity handoff. No fallback clip was generated.`,
    )
  }

  try {
    const finalFrameUrl = await waitForLastFrameUrl(previousJobId, `Scene ${previousSceneNumber}`)
    if (!finalFrameUrl.trim()) {
      throw new Error('completed scene returned an empty final-frame URL')
    }
    return finalFrameUrl
  } catch (cause) {
    throw new SequentialContinuityError(
      `Scene ${currentSceneNumber} was not queued: the completed end state of Scene ${previousSceneNumber} could not be used for continuity. No fallback clip was generated.`,
      cause,
    )
  }
}
