import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BookmarkCheck,
  BookmarkPlus,
  ChevronsRight,
  Clapperboard,
  Coins,
  Combine,
  Download,
  FileUp,
  Film,
  Hammer,
  History,
  LayoutGrid,
  Library,
  LoaderCircle,
  LogOut,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  UserRound,
  X
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { ApiError } from '@/core/api/client'
import { useAuth } from '@/core/auth/AuthProvider'
import { supabase } from '@/integrations/supabase/client'
import WelcomeVideoOverlay from '@/modules/generator-ui/components/WelcomeVideoOverlay'
import type { CreateJobResult, JobDetail, JobSummary } from '@/modules/job-orchestrator/contract'
import { jobOrchestratorGateway } from '@/modules/job-orchestrator/gateway'
import { mergeVideoUrls } from '@/modules/generator-ui/lib/mergeVideos'
import { imageUrlToClip } from '@/modules/generator-ui/lib/imageToClip'
import { proxiedVideoUrl } from '@/modules/generator-ui/lib/proxiedVideoUrl'

type VideoJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
type UploadTarget = 'Start' | 'End'
type UploadedFile = {
  id: number
  name: string
  size: number
  target: UploadTarget
  type: string
  status: 'uploading' | 'ready' | 'failed'
  url: string | null
  error: string | null
}

const VIDEO_POLL_INTERVAL_MS = 4_000
const FRAMES_BUCKET = 'wan-frames'
const MERGED_BUCKET = 'merged-videos'

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

function getStatusDotClassName(status: string) {
  const normalizedStatus = normalizeStatus(status)

  if (normalizedStatus === 'completed') {
    return 'bg-emerald-300'
  }

  if (normalizedStatus === 'failed' || normalizedStatus === 'cancelled') {
    return 'bg-rose-300'
  }

  return 'bg-amber-300'
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

function getJobProgressPercent(job: { status: string; progress_percent?: number | null; created_at: string }): number | null {
  if (typeof job.progress_percent === 'number') return Math.max(0, Math.min(100, Math.round(job.progress_percent)))
  const status = normalizeStatus(job.status)
  if (status === 'completed') return 100
  if (status === 'failed' || status === 'cancelled') return null
  const startedAt = Date.parse(job.created_at)
  if (!Number.isFinite(startedAt)) return status === 'pending' ? 8 : 25
  const elapsed = Date.now() - startedAt
  // Wan 2.7 typically takes ~30-40s of real time per 1s of output. Use 35s/s heuristic, capped to 10s clips.
  const expectedMs = 10 * 35_000
  const ratio = elapsed / expectedMs
  return Math.max(status === 'pending' ? 8 : 18, Math.min(95, Math.round(18 + ratio * 77)))
}

function mergeJob(currentJobs: JobDetail[], nextJob: JobDetail) {
  const remainingJobs = currentJobs.filter((job) => job.id !== nextJob.id)
  return [nextJob, ...remainingJobs].sort(
    // Ascending: oldest first (card #1 at top), newest at the bottom.
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  )
}

// Strip the auto-appended "Attached files:" block that buildPromptWithUploadedFiles adds,
// so the continuation seed carries only the user's original creative description.
function stripAttachedFilesBlock(prompt: string): string {
  const idx = prompt.indexOf('\n\nAttached files:')
  return (idx >= 0 ? prompt.slice(0, idx) : prompt).trim()
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
    // Ascending: oldest first (card #1 at top), newest at the bottom.
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  )
}

function buildSeededJob(
  prompt: string,
  result: CreateJobResult,
  frames?: { firstFrameUrl?: string; lastFrameUrl?: string }
): JobDetail {
  return {
    id: result.jobId,
    status: result.status,
    input_prompt: prompt,
    provider_key: result.providerKey,
    model_key: result.resolvedModel,
    first_frame_url: frames?.firstFrameUrl ?? null,
    last_frame_url: frames?.lastFrameUrl ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    video: null,
    requestId: result.requestId
  }
}

export default function DashboardPage() {
  const { session, profile, signOut, loading: authLoading } = useAuth()
  const [promptText, setPromptText] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [startContext] = useState('Start')
  const [endGoal] = useState('End')
  const [generatedVideos, setGeneratedVideos] = useState<JobDetail[]>([])
  const [isLibraryLoading, setIsLibraryLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [videoColumnMessage, setVideoColumnMessage] = useState<string | null>(null)
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>('Start')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null)
  const [isApprovedPanelOpen, setIsApprovedPanelOpen] = useState(false)
  const [generationMode, setGenerationMode] = useState<'image-to-video' | 'text-to-video'>('image-to-video')
  const [durationSeconds, setDurationSeconds] = useState<5 | 10>(5)
  const userId = session?.user?.id ?? null
  const approvedStorageKey = userId ? `approved-videos:${userId}` : null
  const [approvedIds, setApprovedIds] = useState<Set<string>>(() => new Set())
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    if (!userId) return
    const key = `welcome_seen_${userId}`
    try {
      if (!window.localStorage.getItem(key)) setShowWelcome(true)
    } catch { /* ignore */ }
  }, [userId])

  function dismissWelcome() {
    if (userId) {
      try { window.localStorage.setItem(`welcome_seen_${userId}`, '1') } catch { /* ignore */ }
    }
    setShowWelcome(false)
  }

  useEffect(() => {
    if (!approvedStorageKey) {
      setApprovedIds(new Set())
      return
    }
    try {
      const raw = window.localStorage.getItem(approvedStorageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as string[]
        setApprovedIds(new Set(parsed))
      } else {
        setApprovedIds(new Set())
      }
    } catch {
      setApprovedIds(new Set())
    }
  }, [approvedStorageKey])

  function toggleApproved(jobId: string) {
    setApprovedIds((current) => {
      const next = new Set(current)
      if (next.has(jobId)) {
        next.delete(jobId)
      } else {
        next.add(jobId)
      }
      if (approvedStorageKey) {
        try {
          window.localStorage.setItem(approvedStorageKey, JSON.stringify(Array.from(next)))
        } catch {
          /* ignore quota errors */
        }
      }
      return next
    })
  }

  const deletedStorageKey = userId ? `deleted-videos:${userId}` : null
  const mergedStorageKey = userId ? `merged-videos:${userId}` : null
  const pendingEndAppendsKey = userId ? `pending-end-appends:${userId}` : null
  const pendingStartPrependsKey = userId ? `pending-start-prepends:${userId}` : null
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set())
  const [mergedEntries, setMergedEntries] = useState<JobDetail[]>([])
  const [isMerging, setIsMerging] = useState(false)
  const [mergeProgress, setMergeProgress] = useState<number>(0)
  const [pendingEndAppends, setPendingEndAppends] = useState<Record<string, string>>({})
  const [pendingStartPrepends, setPendingStartPrepends] = useState<Record<string, string>>({})
  const processingEndAppendRef = useRef<Set<string>>(new Set())
  const processingStartPrependRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!pendingEndAppendsKey) {
      setPendingEndAppends({})
      return
    }
    try {
      const raw = window.localStorage.getItem(pendingEndAppendsKey)
      setPendingEndAppends(raw ? (JSON.parse(raw) as Record<string, string>) : {})
    } catch {
      setPendingEndAppends({})
    }
  }, [pendingEndAppendsKey])

  function persistPendingEndAppends(next: Record<string, string>) {
    if (!pendingEndAppendsKey) return
    try {
      window.localStorage.setItem(pendingEndAppendsKey, JSON.stringify(next))
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!pendingStartPrependsKey) {
      setPendingStartPrepends({})
      return
    }
    try {
      const raw = window.localStorage.getItem(pendingStartPrependsKey)
      setPendingStartPrepends(raw ? (JSON.parse(raw) as Record<string, string>) : {})
    } catch {
      setPendingStartPrepends({})
    }
  }, [pendingStartPrependsKey])

  function persistPendingStartPrepends(next: Record<string, string>) {
    if (!pendingStartPrependsKey) return
    try {
      window.localStorage.setItem(pendingStartPrependsKey, JSON.stringify(next))
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!deletedStorageKey) {
      setDeletedIds(new Set())
      return
    }
    try {
      const raw = window.localStorage.getItem(deletedStorageKey)
      setDeletedIds(raw ? new Set(JSON.parse(raw) as string[]) : new Set())
    } catch {
      setDeletedIds(new Set())
    }
  }, [deletedStorageKey])

  useEffect(() => {
    if (!mergedStorageKey) {
      setMergedEntries([])
      return
    }
    try {
      const raw = window.localStorage.getItem(mergedStorageKey)
      setMergedEntries(raw ? (JSON.parse(raw) as JobDetail[]) : [])
    } catch {
      setMergedEntries([])
    }
  }, [mergedStorageKey])

  function persistDeleted(next: Set<string>) {
    if (!deletedStorageKey) return
    try {
      window.localStorage.setItem(deletedStorageKey, JSON.stringify(Array.from(next)))
    } catch { /* ignore */ }
  }

  function persistMerged(next: JobDetail[]) {
    if (!mergedStorageKey) return
    try {
      window.localStorage.setItem(mergedStorageKey, JSON.stringify(next))
    } catch { /* ignore */ }
  }

  async function deleteCard(jobId: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this video card permanently?')) return

    const isMerged = jobId.startsWith('merged-')
    const mergedEntry = isMerged ? mergedEntries.find((e) => e.id === jobId) : null

    // Optimistic UI removal
    setDeletedIds((current) => {
      const next = new Set(current)
      next.add(jobId)
      persistDeleted(next)
      return next
    })
    setApprovedIds((current) => {
      if (!current.has(jobId)) return current
      const next = new Set(current)
      next.delete(jobId)
      if (approvedStorageKey) {
        try { window.localStorage.setItem(approvedStorageKey, JSON.stringify(Array.from(next))) } catch { /* ignore */ }
      }
      return next
    })
    setMergedEntries((current) => {
      if (!current.some((e) => e.id === jobId)) return current
      const next = current.filter((e) => e.id !== jobId)
      persistMerged(next)
      return next
    })
    if (previewVideoId === jobId) setPreviewVideoId(null)

    try {
      if (isMerged) {
        // Local-only entry: purge its file from merged-videos bucket if owned by us.
        const url = mergedEntry?.video?.storage_path
        if (url && userId) {
          const m = url.match(/\/storage\/v1\/object\/(?:public\/)?merged-videos\/(.+)$/)
          if (m) {
            const path = decodeURIComponent(m[1])
            await supabase.storage.from(MERGED_BUCKET).remove([path])
          }
        }
      } else {
        // Real job: backend delete (DB rows + Storage files).
        await jobOrchestratorGateway.deleteJob(jobId)
      }
      // Drop from in-memory list as well so the card never reappears on re-render.
      setGeneratedVideos((current) => current.filter((v) => v.id !== jobId))
    } catch (err) {
      // Roll back the hide so the user sees the card again.
      setDeletedIds((current) => {
        const next = new Set(current)
        next.delete(jobId)
        persistDeleted(next)
        return next
      })
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      if (typeof window !== 'undefined') window.alert(`Delete failed: ${msg}`)
    }
  }

  const pollTimerRef = useRef<number | null>(null)
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isTextToVideo = generationMode === 'text-to-video'
  const hasComposerInput = promptText.trim().length > 0 || uploadedFiles.length > 0
  const readyStartFrame = uploadedFiles.find((file) => file.target === 'Start' && file.status === 'ready' && file.url)
  const readyEndFrame = uploadedFiles.find((file) => file.target === 'End' && file.status === 'ready' && file.url)
  const hasUploadingFiles = uploadedFiles.some((file) => file.status === 'uploading')
  const hasAnyReadyFrame = Boolean(readyStartFrame?.url || readyEndFrame?.url)
  const framesSatisfied = isTextToVideo ? true : hasAnyReadyFrame
  const canSubmit = promptText.trim().length > 0 && framesSatisfied && !hasUploadingFiles && !isSubmitting
  const blockedReason = useMemo(() => {
    if (isSubmitting) return null
    if (hasUploadingFiles) return 'Waiting for frame uploads to finish…'
    if (!promptText.trim()) {
      return isTextToVideo
        ? 'Describe the video you want to generate.'
        : 'Describe the motion for the frame(s).'
    }
    if (!isTextToVideo && !readyStartFrame && !readyEndFrame) {
      return 'Add a Start or End frame image (use the Start/End buttons on the left).'
    }
    return null
  }, [isSubmitting, hasUploadingFiles, readyStartFrame, readyEndFrame, promptText, isTextToVideo])
  const [composerError, setComposerError] = useState<string | null>(null)
  const startUploadCount = uploadedFiles.filter((file) => file.target === 'Start').length
  const endUploadCount = uploadedFiles.filter((file) => file.target === 'End').length
  const visibleVideos = useMemo(() => {
    const all = [...mergedEntries, ...generatedVideos]
    return all.filter((v) => !deletedIds.has(v.id))
  }, [generatedVideos, mergedEntries, deletedIds])

  const completedSourceVideos = useMemo(
    () => generatedVideos.filter(
      (v) => !deletedIds.has(v.id)
        && normalizeStatus(v.status) === 'completed'
        && v.video?.storage_path
    ),
    [generatedVideos, deletedIds]
  )

  const previewVideo = useMemo(() => {
    if (visibleVideos.length === 0) {
      return null
    }

    // Newest item is at the END of visibleVideos (ascending order). Auto-preview
    // the most recent completed render when nothing is explicitly selected.
    const explicit = visibleVideos.find((video) => video.id === previewVideoId)
    if (explicit) return explicit
    for (let i = visibleVideos.length - 1; i >= 0; i--) {
      if (visibleVideos[i].video?.storage_path) return visibleVideos[i]
    }
    return visibleVideos[visibleVideos.length - 1]
  }, [visibleVideos, previewVideoId])

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
          error instanceof ApiError ? `${error.code}: ${error.message}` : 'Could not load render history.'
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
          error instanceof ApiError ? `${error.code}: ${error.message}` : 'Could not refresh render status.'
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

  // When a job that has a pending end-frame append completes, merge a 2s
  // still clip of the End image to the end of the video and replace the
  // job's video with the merged output.
  useEffect(() => {
    if (!userId) return
    const pendingIds = Object.keys(pendingEndAppends)
    if (pendingIds.length === 0) return

    pendingIds.forEach((jobId) => {
      if (processingEndAppendRef.current.has(jobId)) return
      const job = generatedVideos.find((j) => j.id === jobId)
      if (!job) return
      if (normalizeStatus(job.status) !== 'completed') return
      if (!job.video?.storage_path) return

      const endImageUrl = pendingEndAppends[jobId]
      processingEndAppendRef.current.add(jobId)

      ;(async () => {
        try {
          const proxiedSrc = await proxiedVideoUrl(job.video!.storage_path)
          const stillClipBlob = await imageUrlToClip(endImageUrl, 2)

          // Upload the still clip to storage so mergeVideoUrls can fetch it.
          const stillPath = `${userId}/end-still-${Date.now()}-${crypto.randomUUID()}.webm`
          const { error: stillErr } = await supabase.storage
            .from(MERGED_BUCKET)
            .upload(stillPath, stillClipBlob, { contentType: 'video/webm', upsert: false })
          if (stillErr) throw new Error(stillErr.message)
          const stillPublic = supabase.storage.from(MERGED_BUCKET).getPublicUrl(stillPath).data.publicUrl

          const mergedBlob = await mergeVideoUrls([proxiedSrc, stillPublic])
          const mergedPath = `${userId}/with-end-${Date.now()}-${crypto.randomUUID()}.webm`
          const { error: upErr } = await supabase.storage
            .from(MERGED_BUCKET)
            .upload(mergedPath, mergedBlob, { contentType: 'video/webm', upsert: false })
          if (upErr) throw new Error(upErr.message)
          const mergedPublic = supabase.storage.from(MERGED_BUCKET).getPublicUrl(mergedPath).data.publicUrl

          // Replace the job's video URL in local state so the UI shows the
          // merged version (with the End frame appended).
          setGeneratedVideos((current) =>
            current.map((j) =>
              j.id === jobId && j.video
                ? { ...j, video: { ...j.video, storage_path: mergedPublic } }
                : j,
            ),
          )
        } catch (err) {
          console.error('[end-append] failed', err)
          setVideoColumnMessage(
            `Could not append End frame to video: ${err instanceof Error ? err.message : 'unknown error'}`,
          )
        } finally {
          // Remove from pending map regardless of outcome to avoid retry loops.
          setPendingEndAppends((current) => {
            if (!(jobId in current)) return current
            const next = { ...current }
            delete next[jobId]
            persistPendingEndAppends(next)
            return next
          })
          processingEndAppendRef.current.delete(jobId)
        }
      })()
    })
  }, [generatedVideos, pendingEndAppends, userId])

  // Mirror of the end-append effect, but PREPENDS the Start frame as a 2s
  // still clip to the front of the generated text-to-video output.
  useEffect(() => {
    if (!userId) return
    const pendingIds = Object.keys(pendingStartPrepends)
    if (pendingIds.length === 0) return

    pendingIds.forEach((jobId) => {
      if (processingStartPrependRef.current.has(jobId)) return
      const job = generatedVideos.find((j) => j.id === jobId)
      if (!job) return
      if (normalizeStatus(job.status) !== 'completed') return
      if (!job.video?.storage_path) return

      const startImageUrl = pendingStartPrepends[jobId]
      processingStartPrependRef.current.add(jobId)

      ;(async () => {
        try {
          const proxiedSrc = await proxiedVideoUrl(job.video!.storage_path)
          const stillClipBlob = await imageUrlToClip(startImageUrl, 2)

          const stillPath = `${userId}/start-still-${Date.now()}-${crypto.randomUUID()}.webm`
          const { error: stillErr } = await supabase.storage
            .from(MERGED_BUCKET)
            .upload(stillPath, stillClipBlob, { contentType: 'video/webm', upsert: false })
          if (stillErr) throw new Error(stillErr.message)
          const stillPublic = supabase.storage.from(MERGED_BUCKET).getPublicUrl(stillPath).data.publicUrl

          const mergedBlob = await mergeVideoUrls([stillPublic, proxiedSrc])
          const mergedPath = `${userId}/with-start-${Date.now()}-${crypto.randomUUID()}.webm`
          const { error: upErr } = await supabase.storage
            .from(MERGED_BUCKET)
            .upload(mergedPath, mergedBlob, { contentType: 'video/webm', upsert: false })
          if (upErr) throw new Error(upErr.message)
          const mergedPublic = supabase.storage.from(MERGED_BUCKET).getPublicUrl(mergedPath).data.publicUrl

          setGeneratedVideos((current) =>
            current.map((j) =>
              j.id === jobId && j.video
                ? { ...j, video: { ...j.video, storage_path: mergedPublic } }
                : j,
            ),
          )
        } catch (err) {
          console.error('[start-prepend] failed', err)
          setVideoColumnMessage(
            `Could not prepend Start frame to video: ${err instanceof Error ? err.message : 'unknown error'}`,
          )
        } finally {
          setPendingStartPrepends((current) => {
            if (!(jobId in current)) return current
            const next = { ...current }
            delete next[jobId]
            persistPendingStartPrepends(next)
            return next
          })
          processingStartPrependRef.current.delete(jobId)
        }
      })()
    })
  }, [generatedVideos, pendingStartPrepends, userId])

  useEffect(() => {
    if (!previewVideoId && previewVideo?.id) {
      setPreviewVideoId(previewVideo.id)
    }
  }, [previewVideoId, previewVideo?.id])

  function focusPromptInput() {
    promptInputRef.current?.focus()
  }

  function triggerFilePicker(target: UploadTarget) {
    setUploadTarget(target)
    fileInputRef.current?.click()
  }

  function handleFilesDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragging(false)
    addUploadedFiles(event.dataTransfer.files)
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    addUploadedFiles(event.target.files)
    event.target.value = ''
  }

  async function uploadFrameFile(file: File, target: UploadTarget, fileId: number) {
    const userId = session?.user?.id
    if (!userId) {
      setUploadedFiles((currentFiles) => currentFiles.map((uploadedFile) => (
        uploadedFile.id === fileId
          ? { ...uploadedFile, status: 'failed', error: 'Sign in before uploading frames' }
          : uploadedFile
      )))
      return
    }

    if (!file.type.startsWith('image/')) {
      setUploadedFiles((currentFiles) => currentFiles.map((uploadedFile) => (
        uploadedFile.id === fileId
          ? { ...uploadedFile, status: 'failed', error: 'Only image frames are supported' }
          : uploadedFile
      )))
      return
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
    const storagePath = `${userId}/${target.toLowerCase()}-${Date.now()}-${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage
      .from(FRAMES_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false })

    if (error) {
      setUploadedFiles((currentFiles) => currentFiles.map((uploadedFile) => (
        uploadedFile.id === fileId
          ? { ...uploadedFile, status: 'failed', error: error.message } 
          : uploadedFile
      )))
      return
    }

    const { data } = supabase.storage.from(FRAMES_BUCKET).getPublicUrl(storagePath)
    setUploadedFiles((currentFiles) => currentFiles.map((uploadedFile) => (
      uploadedFile.id === fileId
        ? { ...uploadedFile, status: 'ready', url: data.publicUrl, error: null }
        : uploadedFile
    )))
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
      type: file.type || 'file',
      status: 'uploading' as const,
      url: null,
      error: null,
    }))

    setUploadedFiles((currentFiles) => [...currentFiles, ...nextFiles])
    nextFiles.forEach((nextFile, index) => {
      uploadFrameFile(files[index], target, nextFile.id)
    })
  }

  function removeUploadedFile(fileId: number) {
    setUploadedFiles((currentFiles) => currentFiles.filter((file) => file.id !== fileId))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSubmit) {
      setComposerError(blockedReason ?? 'Add a prompt and Start/End frames before rendering.')
      return
    }

    const nextPrompt = buildPromptWithUploadedFiles(promptText.trim(), uploadedFiles)

    setIsSubmitting(true)
    setComposerError(null)
    setVideoColumnMessage(null)

    try {
      let createdJob
      let seedFrames: { firstFrameUrl?: string; lastFrameUrl?: string } = {}
      let pendingEndAppendUrl: string | null = null
      let pendingStartPrependUrl: string | null = null

      if (isTextToVideo) {
        createdJob = await jobOrchestratorGateway.createJob({
          providerKey: 'wan',
          requestedModel: 'wan2.7-t2v-2026-04-25',
          prompt: nextPrompt,
          durationSeconds,
        })
      } else if (readyStartFrame?.url && readyEndFrame?.url) {
        // Both frames provided — standard image-to-video.
        createdJob = await jobOrchestratorGateway.createJob({
          providerKey: 'wan',
          prompt: nextPrompt,
          firstFrameUrl: readyStartFrame.url,
          lastFrameUrl: readyEndFrame.url,
          durationSeconds,
        })
        seedFrames = { firstFrameUrl: readyStartFrame.url, lastFrameUrl: readyEndFrame.url }
      } else if (readyStartFrame?.url) {
        // Only Start: generate directly from the first frame so the prompt
        // animates that image instead of creating a separate text-only clip.
        createdJob = await jobOrchestratorGateway.createJob({
          providerKey: 'wan',
          prompt: nextPrompt,
          firstFrameUrl: readyStartFrame.url,
          durationSeconds,
        })
        seedFrames = { firstFrameUrl: readyStartFrame.url }
      } else if (readyEndFrame?.url) {
        // Only End: generate text-to-video first, then append the End image
        // as a 2-second still clip after the job completes.
        createdJob = await jobOrchestratorGateway.createJob({
          providerKey: 'wan',
          requestedModel: 'wan2.7-t2v-2026-04-25',
          prompt: nextPrompt,
          durationSeconds,
        })
        pendingEndAppendUrl = readyEndFrame.url
        seedFrames = { lastFrameUrl: readyEndFrame.url }
      } else {
        setComposerError('Add a Start or End image before rendering.')
        return
      }

      const seededJob = buildSeededJob(nextPrompt, createdJob, seedFrames)
      setPreviewVideoId(seededJob.id)
      setGeneratedVideos((currentJobs) => mergeJob(currentJobs, seededJob))
      setPromptText('')
      setUploadedFiles([])

      if (pendingEndAppendUrl) {
        setPendingEndAppends((current) => {
          const next = { ...current, [seededJob.id]: pendingEndAppendUrl }
          persistPendingEndAppends(next)
          return next
        })
      }
      if (pendingStartPrependUrl) {
        setPendingStartPrepends((current) => {
          const next = { ...current, [seededJob.id]: pendingStartPrependUrl }
          persistPendingStartPrepends(next)
          return next
        })
      }
    } catch (error) {
      const message = error instanceof ApiError ? `${error.code}: ${error.message}` : 'Could not start video generation.'
      setComposerError(message)
      setVideoColumnMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function resetComposer() {
    setPromptText('')
    setUploadedFiles([])
    setVideoColumnMessage(null)
  }

  async function handleSignOut() {
    await signOut()
  }

  function startPreviewVideo(jobId: string) {
    setPreviewVideoId(jobId)
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragging(false)
  }

  async function appendEndFrameToActiveClip() {
    const job = previewVideo
    const end = readyEndFrame?.url
    if (!job?.video?.storage_path || !end || !userId) {
      setComposerError('Add an End image and select a completed clip first.')
      return
    }
    try {
      setIsSubmitting(true)
      setComposerError(null)
      const proxiedSrc = await proxiedVideoUrl(job.video.storage_path)
      const stillClipBlob = await imageUrlToClip(end, 2)
      const stillPath = `${userId}/end-still-${Date.now()}-${crypto.randomUUID()}.webm`
      const { error: stillErr } = await supabase.storage
        .from(MERGED_BUCKET)
        .upload(stillPath, stillClipBlob, { contentType: 'video/webm', upsert: false })
      if (stillErr) throw new Error(stillErr.message)
      const stillPublic = supabase.storage.from(MERGED_BUCKET).getPublicUrl(stillPath).data.publicUrl

      const mergedBlob = await mergeVideoUrls([proxiedSrc, stillPublic], (p) => setMergeProgress(p))
      const filename = `with-end-${Date.now()}.webm`
      const storagePath = `${userId}/${filename}`
      const { error: upErr } = await supabase.storage
        .from(MERGED_BUCKET)
        .upload(storagePath, mergedBlob, { contentType: 'video/webm', upsert: false })
      if (upErr) throw new Error(upErr.message)
      const publicUrl = supabase.storage.from(MERGED_BUCKET).getPublicUrl(storagePath).data.publicUrl

      setGeneratedVideos((current) =>
        current.map((v) =>
          v.id === job.id && v.video
            ? { ...v, video: { ...v.video, storage_path: publicUrl } }
            : v,
        ),
      )
      setPreviewVideoId(job.id)
    } catch (err) {
      setComposerError(`Could not append End frame: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setIsSubmitting(false)
      setMergeProgress(0)
    }
  }

  async function prependStartFrameToActiveClip() {
    const job = previewVideo
    const start = readyStartFrame?.url
    if (!job?.video?.storage_path || !start || !userId) {
      setComposerError('Add a Start image and select a completed clip first.')
      return
    }
    try {
      setIsSubmitting(true)
      setComposerError(null)
      const proxiedSrc = await proxiedVideoUrl(job.video.storage_path)
      const stillClipBlob = await imageUrlToClip(start, 2)
      const stillPath = `${userId}/start-still-${Date.now()}-${crypto.randomUUID()}.webm`
      const { error: stillErr } = await supabase.storage
        .from(MERGED_BUCKET)
        .upload(stillPath, stillClipBlob, { contentType: 'video/webm', upsert: false })
      if (stillErr) throw new Error(stillErr.message)
      const stillPublic = supabase.storage.from(MERGED_BUCKET).getPublicUrl(stillPath).data.publicUrl

      const mergedBlob = await mergeVideoUrls([stillPublic, proxiedSrc], (p) => setMergeProgress(p))
      const filename = `with-start-${Date.now()}.webm`
      const storagePath = `${userId}/${filename}`
      const { error: upErr } = await supabase.storage
        .from(MERGED_BUCKET)
        .upload(storagePath, mergedBlob, { contentType: 'video/webm', upsert: false })
      if (upErr) throw new Error(upErr.message)
      const publicUrl = supabase.storage.from(MERGED_BUCKET).getPublicUrl(storagePath).data.publicUrl

      setGeneratedVideos((current) =>
        current.map((v) =>
          v.id === job.id && v.video
            ? { ...v, video: { ...v.video, storage_path: publicUrl } }
            : v,
        ),
      )
      setPreviewVideoId(job.id)
    } catch (err) {
      setComposerError(`Could not prepend Start frame: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setIsSubmitting(false)
      setMergeProgress(0)
    }
  }

  async function editAndReusePreviousClip() {
    const prev = previewVideo
    if (!prev || !userId) {
      setComposerError('Select a previous clip first.')
      return
    }

    try {
      setComposerError(null)

      // Seed prompt with previous clip's original prompt (without appended file list).
      const basePrompt = stripAttachedFilesBlock(prev.input_prompt ?? '')
      setPromptText(basePrompt)

      // Clear current uploads; we'll seed Start/End from the previous clip itself.
      setUploadedFiles([])

      // Seed Start from the previous video's LAST frame when possible. This makes
      // the new prompt naturally continue from the selected clip.
      if (prev?.video?.storage_path && userId) {
        try {
          const proxied = await proxiedVideoUrl(prev.video.storage_path)
          const clip = await imageUrlToClip(proxied, 0.05)
          // imageUrlToClip returns a video, not a still. We need a frame grab, so
          // use the browser to sample the last frame and upload it as a PNG.
          const video = document.createElement('video')
          video.src = proxied
          video.crossOrigin = 'anonymous'
          video.muted = true
          await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => resolve()
            video.onerror = () => reject(new Error('Could not load previous clip for frame seeding.'))
          })
          const targetTime = Math.max(0, (video.duration || 0) - 0.05)
          await new Promise<void>((resolve, reject) => {
            const onSeeked = () => resolve()
            video.onseeked = onSeeked
            video.onerror = () => reject(new Error('Could not seek previous clip.'))
            video.currentTime = targetTime
          })
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth || 1280
          canvas.height = video.videoHeight || 720
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('Canvas unavailable')
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Frame export failed')), 'image/png'))
          const storagePath = `${userId}/start-${Date.now()}-${crypto.randomUUID()}.png`
          const { error: upErr } = await supabase.storage
            .from(FRAMES_BUCKET)
            .upload(storagePath, blob, { contentType: 'image/png', upsert: false })
          if (upErr) throw upErr
          const { data } = supabase.storage.from(FRAMES_BUCKET).getPublicUrl(storagePath)
          const seeded: UploadedFile = {
            id: Date.now(),
            name: 'seed-from-previous.png',
            size: blob.size,
            target: 'Start',
            type: 'image/png',
            status: 'ready',
            url: data.publicUrl,
            error: null,
          }
          setUploadedFiles([seeded])
        } catch (e) {
          // Non-fatal: user can still type a prompt and attach frames manually.
          setVideoColumnMessage((e as Error).message)
        }
      }

      focusPromptInput()
    } catch (e) {
      setComposerError((e as Error).message)
    }
  }

  async function mergeVisibleVideos() {
    if (completedSourceVideos.length < 2) {
      setVideoColumnMessage('Complete at least two videos before merging.')
      return
    }
    if (!userId) {
      setVideoColumnMessage('Sign in before merging videos.')
      return
    }

    setIsMerging(true)
    setMergeProgress(0)
    setVideoColumnMessage(null)

    try {
      const urls = completedSourceVideos
        .map((v) => v.video!.storage_path)

      const blob = await mergeVideoUrls(urls, (p) => setMergeProgress(p))

      const filename = `merged-${Date.now()}.webm`
      const storagePath = `${userId}/${filename}`
      const { error: upErr } = await supabase.storage
        .from(MERGED_BUCKET)
        .upload(storagePath, blob, { contentType: 'video/webm', upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { data } = supabase.storage.from(MERGED_BUCKET).getPublicUrl(storagePath)
      const publicUrl = data.publicUrl

      const mergedId = `merged-${crypto.randomUUID()}`
      const entry: JobDetail = {
        id: mergedId,
        status: 'completed',
        input_prompt: `Final merged video — ${urls.length} clips`,
        provider_key: 'merged',
        model_key: 'browser-canvas',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        video: {
          id: mergedId,
          storage_path: publicUrl,
          thumbnail_url: null,
          aspect_ratio: null,
          duration: null,
        },
      }

      setMergedEntries((current) => {
        const next = [entry, ...current]
        persistMerged(next)
        return next
      })
      // Auto-add to library (left panel).
      setApprovedIds((current) => {
        const next = new Set(current)
        next.add(mergedId)
        if (approvedStorageKey) {
          try { window.localStorage.setItem(approvedStorageKey, JSON.stringify(Array.from(next))) } catch { /* ignore */ }
        }
        return next
      })
      setPreviewVideoId(mergedId)

      // Trigger download.
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4_000)
    } catch (err) {
      setVideoColumnMessage(`Could not merge videos: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setIsMerging(false)
      setMergeProgress(0)
    }
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
      {showWelcome && <WelcomeVideoOverlay onClose={dismissWelcome} />}
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-6 px-4 py-6 md:px-6 xl:flex-row">
        <aside className="w-full rounded-[28px] border border-white/10 bg-zinc-950/80 p-5 shadow-[0_28px_110px_rgba(0,0,0,0.45)] xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)] xl:max-h-[calc(100vh-3rem)] xl:w-[18rem] xl:flex-none xl:overflow-hidden">
          <div className="flex h-full flex-col gap-5">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.26em] text-zinc-500">Prompt Forge</p>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Build your clip narrative</h1>
              <p className="max-w-xs text-sm leading-6 text-zinc-400">
                Shape a motion prompt, seed it with frames, and keep only the clips worth carrying forward.
              </p>
            </div>

            <div className="space-y-3 rounded-[22px] border border-white/10 bg-zinc-900/90 p-4">
              <div className="flex items-center gap-3 text-sm text-zinc-200">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-zinc-100">
                  <UserRound className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-white">{profile?.email ?? session?.user?.email ?? 'Guest builder'}</p>
                  <p className="text-xs text-zinc-500">{profile?.role === 'admin' ? 'Administrator' : 'Creator workspace'}</p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                <span className="flex items-center gap-2 font-medium">
                  <Coins className="h-4 w-4" />
                  Credits available
                </span>
                <span className="text-lg font-semibold text-white">{profile?.credits_balance ?? 0}</span>
              </div>
            </div>

            <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-3 xl:grid-cols-1">
              {[
                {
                  icon: Hammer,
                  label: 'Start Context',
                  value: startContext,
                  actionLabel: 'Set Start',
                  onAction: () => triggerFilePicker('Start')
                },
                {
                  icon: ArrowRight,
                  label: 'End Goal',
                  value: endGoal,
                  actionLabel: 'Set End',
                  onAction: () => triggerFilePicker('End')
                },
                {
                  icon: Sparkles,
                  label: 'Video Generation',
                  value: generationMode === 'image-to-video' ? 'Image-to-video' : 'Text-to-video',
                  actionLabel: 'Prompt Only',
                  onAction: focusPromptInput
                }
              ].map(({ icon: Icon, label, value, actionLabel, onAction }) => (
                <div
                  key={label}
                  className="group relative overflow-hidden rounded-[22px] border border-white/10 bg-zinc-900/85 p-4 transition hover:border-emerald-400/40 hover:bg-zinc-900"
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_55%)] opacity-0 transition group-hover:opacity-100" />
                  <div className="relative flex h-full flex-col gap-4">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-zinc-500">
                      <span>{label}</span>
                      <Icon className="h-4 w-4 text-zinc-600" />
                    </div>
                    <p className="text-lg font-medium tracking-tight text-white">{value}</p>
                    <button
                      type="button"
                      onClick={onAction}
                      className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-emerald-400/40 hover:text-emerald-200"
                    >
                      {actionLabel}
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 rounded-[24px] border border-white/10 bg-zinc-950/90 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-zinc-500">
                <Library className="h-4 w-4" />
                Video Library
              </div>
              <div className="max-h-64 space-y-3 overflow-y-auto pr-1 xl:max-h-none xl:flex-1">
                {isLibraryLoading ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/70 px-3 py-4 text-sm text-zinc-400">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Loading saved clips...
                  </div>
                ) : approvedIds.size === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-900/60 px-4 py-6 text-sm leading-6 text-zinc-500">
                    Approve finished renders to keep them in this reusable stack.
                  </div>
                ) : (
                  visibleVideos
                    .filter((video) => approvedIds.has(video.id))
                    .slice(0, 6)
                    .map((video) => {
                      const isActive = previewVideoId === video.id
                      return (
                        <button
                          key={`approved-${video.id}`}
                          type="button"
                          onClick={() => startPreviewVideo(video.id)}
                          className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                            isActive
                              ? 'border-emerald-400/60 bg-emerald-500/10 text-white'
                              : 'border-white/10 bg-zinc-900/70 text-zinc-300 hover:border-white/20 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-white line-clamp-1">{video.input_prompt || 'Approved render'}</p>
                              <p className="text-xs text-zinc-500">{formatCreatedAt(video.created_at)}</p>
                            </div>
                            <BookmarkCheck className="h-4 w-4" />
                          </div>
                        </button>
                      )
                    })
                )}
              </div>
              {approvedIds.size > 0 ? (
                <button
                  type="button"
                  onClick={() => setIsApprovedPanelOpen((current) => !current)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition hover:text-white"
                >
                  <History className="h-4 w-4" />
                  {isApprovedPanelOpen ? 'Hide approved stack' : 'Show full approved stack'}
                </button>
              ) : null}
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-3 pt-2 text-sm text-zinc-500">
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-zinc-300 transition hover:border-white/20 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="flex min-h-[420px] flex-col rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.92),rgba(6,6,7,0.98))] p-6 shadow-[0_28px_110px_rgba(0,0,0,0.45)]">
              <div className="flex flex-col gap-5 border-b border-white/10 pb-5 md:flex-row md:items-start md:justify-between">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.26em] text-zinc-500">Video Workspace</p>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-semibold tracking-tight text-white">{emptyStateLabel}</h2>
                    <p className="max-w-2xl text-sm leading-6 text-zinc-400">
                      Move from the first visual anchor toward the ending you want, then keep iterating until the sequence feels right.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                  <button
                    type="button"
                    onClick={resetComposer}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 transition hover:border-white/20 hover:text-white"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Clear inputs
                  </button>
                  <button
                    type="button"
                    onClick={editAndReusePreviousClip}
                    disabled={!previewVideo}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 transition ${
                      previewVideo
                        ? 'border-white/10 text-zinc-300 hover:border-emerald-400/40 hover:text-white'
                        : 'cursor-not-allowed border-white/5 text-zinc-600'
                    }`}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit &amp; reuse
                  </button>
                </div>
              </div>

              <div className="mt-6 flex-1 space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    { key: 'Start' as const, label: 'Start frame', count: startUploadCount, target: 'Start' as const },
                    { key: 'End' as const, label: 'End frame', count: endUploadCount, target: 'End' as const }
                  ].map(({ key, label, count, target }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => triggerFilePicker(target)}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleFilesDrop}
                      className={`group relative flex min-h-[176px] flex-col justify-between overflow-hidden rounded-[28px] border border-dashed p-5 text-left transition ${
                        isDragging
                          ? 'border-emerald-400/60 bg-emerald-500/10'
                          : 'border-white/10 bg-zinc-900/65 hover:border-emerald-400/35 hover:bg-zinc-900/85'
                      }`}
                    >
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_60%)] opacity-0 transition group-hover:opacity-100" />
                      <div className="relative flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">{label}</p>
                          <p className="mt-2 text-lg font-medium text-white">Drop an image or browse</p>
                        </div>
                        <FileUp className="h-5 w-5 text-zinc-600 transition group-hover:text-emerald-300" />
                      </div>
                      <div className="relative flex items-center justify-between gap-3 text-sm text-zinc-400">
                        <span>{count === 0 ? 'No frame attached yet' : `${count} file${count > 1 ? 's' : ''} attached`}</span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-300">
                          {target}
                          <Plus className="h-3 w-3" />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {uploadedFiles.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {uploadedFiles.map((file) => (
                      <div
                        key={file.id}
                        className={`inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm ${
                          file.status === 'failed'
                            ? 'border-rose-500/40 bg-rose-500/10 text-rose-100'
                            : 'border-white/10 bg-zinc-900/75 text-zinc-200'
                        }`}
                      >
                        <span className="font-medium text-white">{file.name}</span>
                        <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                          {file.status === 'uploading' ? 'Uploading' : file.target}
                        </span>
                        {file.status === 'failed' ? <span className="text-xs text-rose-200">{file.error}</span> : null}
                        <button
                          type="button"
                          onClick={() => removeUploadedFile(file.id)}
                          className="inline-flex items-center justify-center rounded-full border border-white/10 p-1 text-zinc-400 transition hover:border-white/20 hover:text-white"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="space-y-2">
                    <label htmlFor="prompt-input" className="text-sm font-medium text-zinc-300">
                      Prompt
                    </label>
                    <textarea
                      ref={promptInputRef}
                      id="prompt-input"
                      value={promptText}
                      onChange={(event) => setPromptText(event.target.value)}
                      placeholder="Describe the motion, tone, camera move, or transformation you want from the frame(s)..."
                      className="h-36 w-full rounded-[26px] border border-white/10 bg-zinc-950/85 px-5 py-4 text-sm leading-6 text-white placeholder:text-zinc-500 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                    />
                  </div>
                  <form
                    onSubmit={handleSubmit}
                    className="flex flex-col gap-3 rounded-[26px] border border-white/10 bg-zinc-900/70 p-4 xl:w-[18rem]"
                  >
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Generation mode</p>
                      <div className="grid grid-cols-2 gap-2 rounded-full border border-white/10 bg-zinc-950/70 p-1">
                        {([
                          { label: 'Image-to-video', value: 'image-to-video' },
                          { label: 'Text-to-video', value: 'text-to-video' }
                        ] as const).map((option) => {
                          const isSelected = generationMode === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setGenerationMode(option.value)}
                              className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                                isSelected
                                  ? 'bg-emerald-400 text-black shadow-[0_12px_30px_rgba(16,185,129,0.2)]'
                                  : 'text-zinc-400 hover:text-white'
                              }`}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Duration</p>
                      <div className="grid grid-cols-2 gap-2 rounded-full border border-white/10 bg-zinc-950/70 p-1">
                        {([5, 10] as const).map((seconds) => {
                          const isSelected = durationSeconds === seconds
                          return (
                            <button
                              key={seconds}
                              type="button"
                              onClick={() => setDurationSeconds(seconds)}
                              className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                                isSelected
                                  ? 'bg-white text-black shadow-[0_12px_30px_rgba(255,255,255,0.15)]'
                                  : 'text-zinc-400 hover:text-white'
                              }`}
                            >
                              {seconds}s
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="flex flex-1 items-end">
                      <button
                        type="submit"
                        disabled={hasUploadingFiles || isSubmitting}
                        className={`w-full rounded-[22px] px-4 py-3 text-sm font-semibold transition ${
                          hasUploadingFiles || isSubmitting
                            ? 'cursor-not-allowed bg-zinc-800 text-zinc-500'
                            : 'bg-white text-black shadow-[0_18px_40px_rgba(255,255,255,0.16)] hover:-translate-y-0.5 hover:bg-emerald-300'
                        }`}
                      >
                        {isSubmitting ? 'Rendering…' : 'Render video'}
                      </button>
                    </div>
                  </form>
                </div>

                {composerError ? (
                  <p className="text-sm text-rose-300">{composerError}</p>
                ) : blockedReason && hasComposerInput ? (
                  <p className="text-xs leading-5 text-zinc-500">{blockedReason}</p>
                ) : null}
              </div>
            </div>

            <div className="flex min-h-[420px] flex-col rounded-[30px] border border-white/10 bg-zinc-950/92 p-5 shadow-[0_28px_110px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Preview</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
                    {previewVideo?.input_prompt ? 'Latest selected render' : 'Nothing rendered yet'}
                  </h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/80 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-zinc-300">
                  <Film className="h-3.5 w-3.5" />
                  {previewVideo ? formatStatusLabel(previewVideo.status) : 'Idle'}
                </div>
              </div>

              {videoColumnMessage ? (
                <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
                  {videoColumnMessage}
                </div>
              ) : null}

              <div className="mt-5 flex-1">
                {previewVideo ? (
                  <div className="flex h-full flex-col gap-4">
                    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black">
                      {previewVideo.video?.storage_path ? (
                        <video
                          key={previewVideo.video.storage_path}
                          src={previewVideo.video.storage_path}
                          controls
                          autoPlay
                          playsInline
                          className="aspect-video w-full bg-black object-contain"
                        />
                      ) : (
                        <div className="flex aspect-video items-center justify-center bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_60%)] text-sm text-zinc-500">
                          <div className="flex flex-col items-center gap-3">
                            <LoaderCircle className="h-6 w-6 animate-spin text-emerald-300" />
                            {normalizeStatus(previewVideo.status) === 'failed'
                              ? 'Render failed before a preview was created.'
                              : 'This render is still being forged.'}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 rounded-[24px] border border-white/10 bg-zinc-900/78 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-zinc-400">
                            <span className={`h-2.5 w-2.5 rounded-full ${getStatusDotClassName(previewVideo.status)}`} />
                            {formatStatusLabel(previewVideo.status)}
                          </div>
                          <p className="text-base font-medium leading-7 text-white">
                            {stripAttachedFilesBlock(previewVideo.input_prompt) || 'Untitled render'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleApproved(previewVideo.id)}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                              approvedIds.has(previewVideo.id)
                                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                                : 'border-white/10 text-zinc-300 hover:border-white/20 hover:text-white'
                            }`}
                          >
                            {approvedIds.has(previewVideo.id) ? <BookmarkCheck className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
                            {approvedIds.has(previewVideo.id) ? 'Approved' : 'Approve'}
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:border-rose-400/40 hover:text-rose-200"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="border-white/10 bg-zinc-950 text-white">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this render?</AlertDialogTitle>
                                <AlertDialogDescription className="text-zinc-400">
                                  This removes the card from your history and attempts to purge its stored video file.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="border-white/10 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteCard(previewVideo.id)}
                                  className="bg-rose-500 text-white hover:bg-rose-400"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.16em] text-zinc-500">
                        <span className="rounded-full border border-white/10 px-3 py-1">{previewVideo.model_key ?? 'Model pending'}</span>
                        <span className="rounded-full border border-white/10 px-3 py-1">{formatCreatedAt(previewVideo.created_at)}</span>
                        {(() => {
                          const p = getJobProgressPercent(previewVideo)
                          return (typeof p === 'number' && !isTerminalStatus(previewVideo.status)) ? (
                            <span className="rounded-full border border-emerald-400/20 px-3 py-1 text-emerald-200">{p}%</span>
                          ) : null
                        })()}
                      </div>

                      {/* One-click visual edit helpers for cases where the user only
                          has a Start or End image and wants to merge that still with
                          the active preview without creating a new render. */}
                      {(readyStartFrame?.url || readyEndFrame?.url) && previewVideo.video?.storage_path ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {readyStartFrame?.url ? (
                            <button
                              type="button"
                              onClick={prependStartFrameToActiveClip}
                              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:border-emerald-400/40 hover:text-white"
                            >
                              <ArrowRight className="h-4 w-4 rotate-180" />
                              Prepend Start
                            </button>
                          ) : null}
                          {readyEndFrame?.url ? (
                            <button
                              type="button"
                              onClick={appendEndFrameToActiveClip}
                              className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:border-emerald-400/40 hover:text-white"
                            >
                              <ArrowRight className="h-4 w-4" />
                              Append End
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[18rem] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-zinc-900/60 px-8 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-zinc-950 text-zinc-500">
                      <Clapperboard className="h-7 w-7" />
                    </div>
                    <h3 className="mt-5 text-lg font-medium text-white">Render output lands here</h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                      Upload frame references, shape the motion with a prompt, and the latest result will become your preview surface.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-zinc-950/90 p-5 shadow-[0_28px_110px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-4 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Render history</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Iterate, merge, and choose the winners</h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={mergeVisibleVideos}
                  disabled={completedSourceVideos.length < 2 || isMerging}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                    completedSourceVideos.length >= 2 && !isMerging
                      ? 'border-white/10 text-zinc-200 hover:border-emerald-400/40 hover:text-white'
                      : 'cursor-not-allowed border-white/5 text-zinc-600'
                  }`}
                >
                  {isMerging ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Combine className="h-4 w-4" />}
                  Merge approved clips
                </button>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/80 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-zinc-400">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  {visibleVideos.length} visible cards
                </div>
              </div>
            </div>

            {mergeProgress > 0 && isMerging ? (
              <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                Merging video stack… {mergeProgress}%
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {visibleVideos.length === 0 ? (
                <div className="col-span-full rounded-[26px] border border-dashed border-white/10 bg-zinc-900/55 px-6 py-12 text-center text-sm text-zinc-500">
                  Your clips will appear here once you start rendering. Approved items stay easy to spot, and completed videos can be merged when you are ready.
                </div>
              ) : (
                visibleVideos.map((video) => {
                  const status = normalizeStatus(video.status)
                  const isActive = previewVideoId === video.id
                  const isApproved = approvedIds.has(video.id)

                  return (
                    <div
                      key={video.id}
                      className={`group flex h-full flex-col overflow-hidden rounded-[26px] border bg-zinc-900/78 transition ${
                        isActive
                          ? 'border-emerald-400/55 shadow-[0_22px_45px_rgba(16,185,129,0.14)]'
                          : 'border-white/10 hover:border-white/20'
                      } ${isApproved ? 'ring-1 ring-emerald-400/25' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => startPreviewVideo(video.id)}
                        className="flex flex-1 flex-col text-left"
                      >
                        <div className="relative aspect-video overflow-hidden bg-black">
                          {video.video?.storage_path ? (
                            <video
                              src={video.video.storage_path}
                              muted
                              playsInline
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_60%)] text-zinc-500">
                              {status === 'failed' ? (
                                <X className="h-6 w-6" />
                              ) : (
                                <LoaderCircle className="h-6 w-6 animate-spin" />
                              )}
                            </div>
                          )}
                          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
                            <span className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-xs uppercase tracking-[0.18em] backdrop-blur ${status === 'completed' ? 'text-emerald-200' : status === 'failed' ? 'text-rose-200' : 'text-zinc-300'}`}>
                              <span className={`h-2 w-2 rounded-full ${getStatusDotClassName(video.status)}`} />
                              {formatStatusLabel(video.status)}
                            </span>
                            {isApproved ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-black">
                                <BookmarkCheck className="h-3 w-3" />
                                Approved
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col gap-4 p-4">
                          <div className="space-y-2">
                            <p className="text-sm font-medium leading-6 text-white line-clamp-2">
                              {stripAttachedFilesBlock(video.input_prompt) || 'Untitled render'}
                            </p>
                            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                              <span>{formatCreatedAt(video.created_at)}</span>
                              <span className="text-zinc-700">/</span>
                              <span>{video.model_key ?? 'Pending model'}</span>
                              {(() => {
                                const p = getJobProgressPercent(video)
                                return (typeof p === 'number' && !isTerminalStatus(video.status)) ? (
                                  <>
                                    <span className="text-zinc-700">/</span>
                                    <span className="text-emerald-200">{p}%</span>
                                  </>
                                ) : null
                              })()}
                            </div>
                          </div>

                          <div className="mt-auto flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                              <ChevronsRight className="h-4 w-4" />
                              {video.video?.storage_path ? 'Preview ready' : 'Still processing'}
                            </div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.16em] text-zinc-300">
                              {status === 'completed' ? 'Open preview' : 'Tracking'}
                            </span>
                          </div>
                        </div>
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
