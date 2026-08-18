import type { JobDetail } from '@/modules/job-orchestrator/contract'

export type AutoFilmBatchSummary = {
  batchId: string
  completed: JobDetail[]
  failed: JobDetail[]
  pending: string[]
}

export type AutoFilmPreviewState = {
  active: { batchId: string; clips: JobDetail[] } | null
  consumedBatchIds: string[]
}

export type AutoFilmPreviewAction =
  | { type: 'batch-settled'; batchId: string; clips: JobDetail[] }
  | { type: 'dismiss' }
  | { type: 'clear-active' }

export function createAutoFilmPreviewState(): AutoFilmPreviewState {
  return { active: null, consumedBatchIds: [] }
}

export function createAutoFilmBatchId(jobIds: string[]): string {
  return `make-full-film:${jobIds.join('|')}`
}

export function summarizeAutoFilmBatch(
  jobIds: string[],
  settledJobs: ReadonlyMap<string, JobDetail>,
  pendingIds: ReadonlySet<string>,
): AutoFilmBatchSummary {
  const completed: JobDetail[] = []
  const failed: JobDetail[] = []

  for (const id of jobIds) {
    const job = settledJobs.get(id)
    if (!job) continue
    if (job.status === 'completed' && job.video?.storage_path) completed.push(job)
    else failed.push(job)
  }

  return {
    batchId: createAutoFilmBatchId(jobIds),
    completed,
    failed,
    pending: jobIds.filter((id) => pendingIds.has(id)),
  }
}

export function autoFilmPreviewReducer(
  state: AutoFilmPreviewState,
  action: AutoFilmPreviewAction,
): AutoFilmPreviewState {
  if (action.type === 'dismiss' || action.type === 'clear-active') {
    return state.active ? { ...state, active: null } : state
  }

  if (action.clips.length === 0 || state.consumedBatchIds.includes(action.batchId)) {
    return state
  }

  return {
    active: { batchId: action.batchId, clips: action.clips },
    consumedBatchIds: [...state.consumedBatchIds, action.batchId],
  }
}
