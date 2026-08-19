import { ApiError } from '@/core/api/client'

export type SceneQueueFailure = {
  sceneIndex: number
  message: string
}

export type SceneQueueResult = {
  jobIds: string[]
  failed: SceneQueueFailure[]
}

export type SceneBatchResult = {
  completed: string[]
  failed: string[]
  pending: string[]
}

type BatchJob = {
  id: string
  status: string
  video: { storage_path: string } | null
}

export class GlobalSceneBatchError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
    public readonly partial: SceneQueueResult,
  ) {
    super(message)
    this.name = 'GlobalSceneBatchError'
  }
}

export function isGlobalSceneBatchError(error: unknown): boolean {
  return error instanceof ApiError && (
    error.status === 401 ||
    error.status === 402 ||
    error.status === 403 ||
    error.code === 'SESSION_EXPIRED' ||
    error.code === 'INSUFFICIENT_CREDITS'
  )
}

export async function queueSceneBatch(
  scenes: string[],
  queueScene: (scene: string, sceneIndex: number) => Promise<string>,
  onSceneFailure?: (failure: SceneQueueFailure) => void,
): Promise<SceneQueueResult> {
  const result: SceneQueueResult = { jobIds: [], failed: [] }

  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
    const scene = scenes[sceneIndex].trim()
    if (!scene) continue
    try {
      result.jobIds.push(await queueScene(scene, sceneIndex))
    } catch (error) {
      if (isGlobalSceneBatchError(error)) {
        const message = error instanceof Error ? error.message : 'Global scene batch failure'
        throw new GlobalSceneBatchError(message, error, result)
      }
      const failure = {
        sceneIndex,
        message: error instanceof Error ? error.message : 'Could not queue scene',
      }
      result.failed.push(failure)
      onSceneFailure?.(failure)
    }
  }

  return result
}

export async function waitForSceneBatch(
  jobIds: string[],
  getJob: (jobId: string) => Promise<BatchJob>,
  options: {
    timeoutMs?: number
    pollIntervalMs?: number
    now?: () => number
    sleep?: (ms: number) => Promise<void>
    onSettled?: (job: BatchJob) => void
  } = {},
): Promise<SceneBatchResult> {
  const timeoutMs = options.timeoutMs ?? 45 * 60_000
  const pollIntervalMs = options.pollIntervalMs ?? 5_000
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const deadline = now() + timeoutMs
  const pending = new Set(jobIds)
  const completed: string[] = []
  const failed: string[] = []

  while (pending.size > 0 && now() < deadline) {
    for (const id of Array.from(pending)) {
      let job: BatchJob
      try {
        job = await getJob(id)
      } catch {
        continue
      }
      if (job.status === 'completed' && job.video?.storage_path) {
        pending.delete(id)
        completed.push(id)
        options.onSettled?.(job)
      } else if (job.status === 'failed' || job.status === 'cancelled') {
        pending.delete(id)
        failed.push(id)
        options.onSettled?.(job)
      }
    }
    if (pending.size > 0 && now() < deadline) await sleep(pollIntervalMs)
  }

  return { completed, failed, pending: Array.from(pending) }
}
