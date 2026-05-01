import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  ChevronDown,
  ChevronsRight,
  Clapperboard,
  FileUp,
  Film,
  Hammer,
  LayoutGrid,
  LoaderCircle,
  Paperclip,
  Plus,
  Sparkles,
  Upload,
  X
} from 'lucide-react'

import { ApiError } from '@/core/api/client'
import { useAuth } from '@/core/auth/AuthProvider'
import type { CreateJobResult, JobDetail, JobSummary } from '@/modules/job-orchestrator/contract'
import { jobOrchestratorGateway } from '@/modules/job-orchestrator/gateway'

type ForgeMode = 'Prompt' | 'Image' | 'Video' | 'Agent'
type VideoJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
type UploadTarget = 'Start' | 'End'
type UploadedFile = {
  id: number
  name: string
  size: number
  target: UploadTarget
  type: string
}

const modes: ForgeMode[] = ['Prompt', 'Image', 'Video', 'Agent']
const VIDEO_POLL_INTERVAL_MS = 4_000

function isTerminalStatus(status: string) {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function normalizeStatus(status: string): VideoJobStatus {
  if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'processing') {
    return status
  }

  return 'pending'
}

function formatStatusLabel(status: string) {
  switch (normalizeStatus(status)) {
    case 'completed':
      return 'Ready'
    case 'processing':
      return 'Rendering'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return 'Queued'
  }
}

function formatCreatedAt(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Just now'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function buildPromptWithUploadedFiles(prompt: string, files: UploadedFile[]) {
  if (files.length === 0) {
    return prompt
  }

  const fileContext = files
    .map((file) => `- ${file.target}: ${file.name} (${formatFileSize(file.size)})`)
    .join('\n')

  return [prompt || 'Generate from uploaded context', `Attached files:\n${fileContext}`].filter(Boolean).join('\n\n')
}

function mergeJob(currentJobs: JobDetail[], nextJob: JobDetail) {
  const remainingJobs = currentJobs.filter((job) => job.id !== nextJob.id)
  return [nextJob, ...remainingJobs].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  )
}

async function hydrateJobs(summaries: JobSummary[]) {
  const hydratedJobs = await Promise.all(
    summaries.map(async (summary) => {
      try {
        return await jobOrchestratorGateway.getJob(summary.id)
      } catch {
        return {
          ...summary,
          video: null
        } satisfies JobDetail
      }
    })
  )

  return hydratedJobs.sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  )
}

function buildSeededJob(prompt: string, result: CreateJobResult): JobDetail {
  return {
    id: result.jobId,
    status: result.status,
    input_prompt: prompt,
    provider_key: result.providerKey,
    model_key: result.resolvedModel,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    video: null,
    requestId: result.requestId
  }
}

export default function DashboardPage() {
  const { session, loading: authLoading } = useAuth()
  const [promptText, setPromptText] = useState('')
  const [mode, setMode] = useState<ForgeMode>('Prompt')
  const [isDragging, setIsDragging] = useState(false)
  const [startContext] = useState('Start')
  const [endGoal] = useState('End')
  const [generatedVideos, setGeneratedVideos] = useState<JobDetail[]>([])
  const [isLibraryLoading, setIsLibraryLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [videoColumnMessage, setVideoColumnMessage] = useState<string | null>(null)
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>('Start')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isVideoSidebarOpen, setIsVideoSidebarOpen] = useState(false)
  const pollTimerRef = useRef<number | null>(null)
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const hasComposerInput = promptText.trim().length > 0 || uploadedFiles.length > 0
  const canSubmit = hasComposerInput && !isSubmitting
  const startUploadCount = uploadedFiles.filter((file) => file.target === 'Start').length
  const endUploadCount = uploadedFiles.filter((file) => file.target === 'End').length

  const emptyStateLabel = useMemo(() => {
    if (isDragging) {
      return 'Drop context into the forge'
    }

    return hasComposerInput ? 'Shape the next version' : 'Start forging a prompt'
  }, [hasComposerInput, isDragging])

  useEffect(() => {
    if (authLoading) return
    if (!session) {
      setIsLibraryLoading(false)
      return
    }
    let isActive = true

    async function loadVideoJobs() {
      try {
        setVideoColumnMessage(null)
        const jobs = await jobOrchestratorGateway.listMyJobs()
        const hydratedJobs = await hydrateJobs(jobs)

        if (!isActive) {
          return
        }

        setGeneratedVideos(hydratedJobs)
      } catch (error) {
        if (!isActive) {
          return
        }

        setVideoColumnMessage(
          error instanceof ApiError ? `${error.code}: ${error.message}` : 'Could not load generated videos.'
        )
      } finally {
        if (isActive) {
          setIsLibraryLoading(false)
        }
      }
    }

    loadVideoJobs()

    return () => {
      isActive = false
    }
  }, [authLoading, session])

  useEffect(() => {
    const activeJobs = generatedVideos.filter((job) => !isTerminalStatus(job.status))

    if (activeJobs.length === 0) {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
      return
    }

    pollTimerRef.current = window.setTimeout(async () => {
      try {
        const refreshedJobs = await Promise.all(activeJobs.map((job) => jobOrchestratorGateway.getJob(job.id)))
        setGeneratedVideos((currentJobs) =>
          refreshedJobs.reduce((jobs, refreshedJob) => mergeJob(jobs, refreshedJob), currentJobs)
        )
      } catch (error) {
        setVideoColumnMessage(
          error instanceof ApiError ? `${error.code}: ${error.message}` : 'Could not refresh video status.'
        )
      }
    }, VIDEO_POLL_INTERVAL_MS)

    return () => {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [generatedVideos])

  function openFileUpload(target: UploadTarget) {
    setUploadTarget(target)
    fileInputRef.current?.click()
  }

  function addUploadedFiles(files: FileList | null, target = uploadTarget) {
    if (!files?.length) {
      return
    }

    const nextFiles = Array.from(files).map((file, index) => ({
      id: Date.now() + index,
      name: file.name,
      size: file.size,
      target,
      type: file.type || 'file'
    }))

    setUploadedFiles((currentFiles) => [...currentFiles, ...nextFiles])
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    addUploadedFiles(event.currentTarget.files)
    event.currentTarget.value = ''
  }

  function removeUploadedFile(fileId: number) {
    setUploadedFiles((currentFiles) => currentFiles.filter((file) => file.id !== fileId))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSubmit) {
      return
    }

    const nextPrompt = buildPromptWithUploadedFiles(promptText.trim(), uploadedFiles)

    if (mode !== 'Video') {
      setPromptText('')
      setUploadedFiles([])
      return
    }

    setIsSubmitting(true)
    setVideoColumnMessage(null)

    try {
      const createdJob = await jobOrchestratorGateway.createJob({
        providerKey: 'flow',
        prompt: nextPrompt
      })

      setGeneratedVideos((currentJobs) => mergeJob(currentJobs, buildSeededJob(nextPrompt, createdJob)))
      setPromptText('')
      setUploadedFiles([])
    } catch (error) {
      setVideoColumnMessage(
        error instanceof ApiError ? `${error.code}: ${error.message}` : 'Could not start video generation.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleAddVideoCard() {
    setMode('Video')
    promptInputRef.current?.focus()
  }

  return (
    <section
      className="relative min-h-screen overflow-hidden bg-black text-zinc-100"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
        backgroundSize: '64px 64px'
      }}
      onDragEnter={() => setIsDragging(true)}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setIsDragging(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        setIsDragging(false)
        addUploadedFiles(event.dataTransfer.files, 'Start')
      }}
    >
      <div
        className={`pointer-events-none absolute inset-0 border transition duration-200 ${
          isDragging ? 'border-amber-300/40 bg-amber-300/[0.045]' : 'border-transparent'
        }`}
      />

      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.txt,.md,.doc,.docx"
        onChange={handleFileInputChange}
      />

      <button
        className="fixed left-4 top-4 z-40 grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-200/80 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-zinc-100 sm:left-5 sm:top-5"
        type="button"
        aria-expanded={isVideoSidebarOpen}
        aria-label={isVideoSidebarOpen ? 'Close generated videos sidebar' : 'Open generated videos sidebar'}
        onClick={() => setIsVideoSidebarOpen((isOpen) => !isOpen)}
      >
        <LayoutGrid className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      <button
        className="fixed bottom-5 left-5 z-20 hidden h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-200/80 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-zinc-100 sm:grid"
        type="button"
        aria-label="Upload start context"
        onClick={() => openFileUpload('Start')}
      >
        <Upload className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      <main className="grid min-h-screen place-items-center px-4 pb-40" aria-live="polite">
        <div className="-translate-y-10 text-center sm:-translate-y-8">
          <div className="relative mx-auto mb-4 grid h-14 w-14 place-items-center text-zinc-100" aria-hidden="true">
            <Hammer className="h-10 w-10 -rotate-12 stroke-[1.7]" />
            <Sparkles className="absolute right-0 top-0 h-5 w-5 text-amber-300 stroke-[1.8]" />
          </div>
          <p className="m-0 text-base font-medium text-zinc-400 sm:text-lg">{emptyStateLabel}</p>
        </div>
      </main>

      <button
        type="button"
        aria-label="Close generated videos sidebar"
        className={`fixed inset-0 z-20 bg-black/35 transition lg:hidden ${
          isVideoSidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setIsVideoSidebarOpen(false)}
      />

      <aside
        className={`fixed bottom-3 right-3 top-3 z-30 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-[22px] border border-white/10 bg-[#0b0c0e]/90 p-3 shadow-[0_22px_70px_rgba(0,0,0,0.36)] backdrop-blur-xl transition duration-300 sm:bottom-5 sm:right-4 sm:top-5 sm:w-80 lg:z-20 lg:w-72 xl:right-5 xl:w-80 ${
          isVideoSidebarOpen
            ? 'pointer-events-auto visible translate-x-0 opacity-100'
            : 'pointer-events-none invisible translate-x-[calc(100%+1.25rem)] opacity-0'
        }`}
        aria-label="Generated videos"
        aria-hidden={!isVideoSidebarOpen}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <p className="text-xs font-medium text-zinc-500">Video column</p>
            <h2 className="text-sm font-semibold text-zinc-100">Generated videos</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="grid h-8 min-w-8 place-items-center rounded-full border border-white/10 px-2 text-xs font-semibold text-zinc-300">
              {generatedVideos.length}
            </span>
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100"
              aria-label="Close generated videos sidebar"
              onClick={() => setIsVideoSidebarOpen(false)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {videoColumnMessage ? (
          <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-100">
            {videoColumnMessage}
          </div>
        ) : null}

        <div className="relative mt-3 flex-1 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={handleAddVideoCard}
            className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-[#141518]/95 text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-100"
            aria-label="Add new video card"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>

          {isLibraryLoading ? (
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-white/10 px-5 text-center">
              <div>
                <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-zinc-500" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-zinc-300">Loading your renders</p>
                <p className="mt-2 text-xs leading-5 text-zinc-600">Previously generated videos will appear here.</p>
              </div>
            </div>
          ) : generatedVideos.length > 0 ? (
            <div className="grid gap-3">
              {generatedVideos.map((video) => {
                const status = normalizeStatus(video.status)
                const statusDotClassName =
                  status === 'completed'
                    ? 'bg-emerald-300'
                    : status === 'failed' || status === 'cancelled'
                      ? 'bg-rose-300'
                      : 'bg-amber-300'

                return (
                  <article key={video.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#15171a]">
                      {video.video?.storage_path ? (
                        <video
                          className="aspect-video h-full w-full bg-black object-cover"
                          src={video.video.storage_path}
                          controls
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <div className="grid aspect-video place-items-center text-zinc-500">
                          <Clapperboard className="h-8 w-8" aria-hidden="true" />
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-start justify-between gap-3">
                      <p className="max-h-12 overflow-hidden text-sm font-medium leading-6 text-zinc-200">
                        {video.input_prompt}
                      </p>
                      {status === 'processing' ? (
                        <LoaderCircle className="mt-1 h-4 w-4 shrink-0 animate-spin text-amber-300" aria-hidden="true" />
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${statusDotClassName}`} />
                        {formatStatusLabel(video.status)}
                      </span>
                      <span>{formatCreatedAt(video.created_at)}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-white/10 px-5 text-center">
              <div>
                <Film className="mx-auto h-8 w-8 text-zinc-600" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-zinc-300">No videos yet</p>
                <p className="mt-2 text-xs leading-5 text-zinc-600">
                  Choose Video mode and forge a prompt. New generations will collect here.
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>

      <form
        className={`fixed bottom-4 left-1/2 z-30 grid w-[min(45rem,calc(100vw-1rem))] -translate-x-1/2 gap-3 rounded-[22px] border border-white/10 bg-[#111214]/95 p-3 shadow-[0_22px_70px_rgba(0,0,0,0.48)] backdrop-blur-xl transition-[left] duration-300 sm:bottom-[clamp(1rem,4.8vh,3.4rem)] sm:w-[min(45rem,calc(100vw-2rem))] sm:p-4 ${
          isVideoSidebarOpen ? 'lg:left-[calc(50vw_-_9rem)]' : 'lg:left-1/2'
        }`}
        onSubmit={handleSubmit}
      >
        <div className="flex min-h-11 items-center gap-2 sm:min-h-12 sm:gap-3" aria-label="Prompt path">
          <button
            className="inline-flex h-11 min-w-12 items-center justify-center gap-2 rounded-md border border-[#2a2d32] bg-black/10 px-3 text-xs font-semibold text-zinc-200/70 transition hover:border-white/20 hover:bg-white/[0.045] sm:h-12 sm:min-w-[3.25rem]"
            type="button"
            onClick={() => openFileUpload('Start')}
          >
            {startContext}
            {startUploadCount > 0 ? (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-300 px-1 text-[10px] text-zinc-950">
                {startUploadCount}
              </span>
            ) : (
              <FileUp className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
            )}
          </button>
          <ChevronsRight className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden="true" />
          <button
            className="inline-flex h-11 min-w-12 items-center justify-center gap-2 rounded-md border border-[#2a2d32] bg-black/10 px-3 text-xs font-semibold text-zinc-200/70 transition hover:border-white/20 hover:bg-white/[0.045] sm:h-12 sm:min-w-[3.25rem]"
            type="button"
            onClick={() => openFileUpload('End')}
          >
            {endGoal}
            {endUploadCount > 0 ? (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-300 px-1 text-[10px] text-zinc-950">
                {endUploadCount}
              </span>
            ) : (
              <FileUp className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
            )}
          </button>
        </div>

        {uploadedFiles.length > 0 ? (
          <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto border-t border-white/10 pt-3">
            {uploadedFiles.map((file) => (
              <span
                key={file.id}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs text-zinc-300"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
                <span className="max-w-[11rem] truncate">
                  {file.target}: {file.name}
                </span>
                <span className="shrink-0 text-zinc-600">{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-zinc-500 transition hover:bg-white/10 hover:text-zinc-100"
                  onClick={() => removeUploadedFile(file.id)}
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="sr-only" htmlFor="prompt-input">
            Prompt
          </label>
          <textarea
            id="prompt-input"
            ref={promptInputRef}
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
            placeholder="What do you want to forge?"
            rows={1}
            className="min-h-12 max-h-40 w-full resize-y border-0 bg-transparent text-[15px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-500/70"
          />

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <label className="relative inline-flex h-10 min-w-32 items-center rounded-full border border-[#2a2d32] bg-black/20 text-sm font-semibold text-zinc-200/80">
              <span className="sr-only">Output mode</span>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as ForgeMode)}
                className="h-full w-full appearance-none rounded-full bg-transparent py-0 pl-4 pr-10 outline-none"
              >
                {modes.map((item) => (
                  <option key={item} value={item} className="text-zinc-950">
                    {item}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-zinc-500" aria-hidden="true" />
            </label>

            <button
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
              type="submit"
              disabled={!canSubmit}
              aria-label="Forge prompt"
            >
              {isSubmitting ? (
                <LoaderCircle className="h-5 w-5 animate-spin stroke-[2.2]" aria-hidden="true" />
              ) : (
                <ArrowRight className="h-5 w-5 stroke-[2.2]" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}
