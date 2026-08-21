export class FinalFilmPipelineTimeoutError extends Error {
  constructor() {
    super('Final Film took too long (>10 min). Please try again with fewer or shorter clips.')
    this.name = 'FinalFilmPipelineTimeoutError'
  }
}

export function createFinalFilmPipeline(timeoutMs: number) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    controller.abort(new FinalFilmPipelineTimeoutError())
  }, timeoutMs)
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => {
      reject(controller.signal.reason instanceof Error
        ? controller.signal.reason
        : new Error('Final Film cancelled'))
    }, { once: true })
  })

  return {
    controller,
    signal: controller.signal,
    race<T>(operation: PromiseLike<T>): Promise<T> {
      return Promise.race([Promise.resolve(operation), aborted])
    },
    finish() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}

export async function awaitUploadWithLateCleanup<T extends { error?: unknown }>(
  upload: PromiseLike<T>,
  race: <R>(operation: PromiseLike<R>) => Promise<R>,
  cleanup: () => PromiseLike<unknown>,
): Promise<T> {
  let settled = false
  const trackedUpload = Promise.resolve(upload).then((result) => {
    settled = true
    return result
  })

  try {
    return await race(trackedUpload)
  } catch (error) {
    if (!settled) {
      void trackedUpload.then(async (result) => {
        if (!result.error) await cleanup()
      }).catch(() => undefined)
    }
    throw error
  }
}
