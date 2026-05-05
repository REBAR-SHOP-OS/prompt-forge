import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BookmarkCheck,
  BookmarkPlus,
  ChevronsRight,
  FileUp,
  History,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  User,
  Video,
  X,
} from 'lucide-react'

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
  const [isModulesMenuOpen, setIsModulesMenuOpen] = useState(false)
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false)
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
        : 'Describe the motion or change to apply to the image.'
    }
    if (!isTextToVideo && !readyStartFrame && !readyEndFrame) {
      return 'Add at least one Start or End image (use the Start/End buttons below).'
    }
    return null
  }, [isSubmitting, hasUploadingFiles, readyStartFrame, readyEndFrame, promptText, isTextToVideo])
  const [composerError, setComposerError] = useState<string | null>(null)
  const startUploadCount = uploadedFiles.filter((file) => file.target === 'Start').length
  const endUploadCount = uploadedFiles.filter((file) => file.target === 'End').length
  const visibleVideos = useMemo(() => {
    const all = [...mergedEntries, ...generatedVideos]
    return all
      .filter((v) => !deletedIds.has(v.id))
      .sort((l, r) => new Date(l.created_at).getTime() - new Date(r.created_at).getTime())
  }, [generatedVideos, mergedEntries, deletedIds])

  // Only videos that have actually finished rendering and have a playable file.
  const completedVideos = useMemo(
    () => visibleVideos.filter(
      (v) => normalizeStatus(v.status) === 'completed' && v.video?.storage_path
    ),
    [visibleVideos]
  )

  // Only videos the user has explicitly approved (shown in right column).
  const approvedVideos = useMemo(
    () => completedVideos.filter((v) => approvedIds.has(v.id)),
    [completedVideos, approvedIds]
  )

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
      console.error('[handleSubmit] video generation failed', error)
      const message = error instanceof ApiError
        ? `${error.code}: ${error.message}`
        : (error instanceof Error && error.message)
          ? `Could not start video generation: ${error.message}`
          : 'Could not start video generation.'
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

      const mergedBlob = await mergeVideoUrls([proxiedSrc, stillPublic], (p) => setMergeProgress(Math.round(p.ratio * 100)))
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

      const mergedBlob = await mergeVideoUrls([stillPublic, proxiedSrc], (p) => setMergeProgress(Math.round(p.ratio * 100)))
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

      const blob = await mergeVideoUrls(urls, (p) => setMergeProgress(Math.round(p.ratio * 100)))

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
      {/* Minimal Apple-style stage layout */}
      <div
        className="relative min-h-screen w-full overflow-hidden"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      >
        {/* Top bar */}
        <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-5 py-4">
          <div className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsModulesMenuOpen((v) => !v)}
              title="Modules"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
                isModulesMenuOpen || isApprovedPanelOpen || isProfilePanelOpen
                  ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-100'
                  : 'border-white/10 bg-zinc-900/60 text-zinc-300 hover:border-white/20 hover:text-white'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>

            {isModulesMenuOpen ? (
              <>
                {/* click-outside backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsModulesMenuOpen(false)}
                />
                <div
                  className="absolute left-0 top-10 z-50 w-56 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsModulesMenuOpen(false)
                      setIsProfilePanelOpen(true)
                      setIsApprovedPanelOpen(false)
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-white/5 hover:text-white"
                  >
                    <User className="h-4 w-4 text-zinc-400" />
                    <span className="flex-1">User profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsModulesMenuOpen(false)
                      setIsApprovedPanelOpen(true)
                      setIsProfilePanelOpen(false)
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-white/5 hover:text-white"
                  >
                    <Video className="h-4 w-4 text-zinc-400" />
                    <span className="flex-1">Generated videos</span>
                    <span className="rounded-full border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-300">
                      {completedVideos.length}
                    </span>
                  </button>
                </div>
              </>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              // Full UI reset — clear composer, preview, errors, panels, and
              // mode selectors. Keep generated/approved history intact.
              setPromptText('')
              setUploadedFiles([])
              setPreviewVideoId(null)
              setComposerError(null)
              setVideoColumnMessage(null)
              setIsApprovedPanelOpen(false)
              setIsProfilePanelOpen(false)
              setIsModulesMenuOpen(false)
              setGenerationMode('image-to-video')
              setDurationSeconds(5)
              setUploadTarget('Start')
              setIsDragging(false)
            }}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-zinc-900/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-200 backdrop-blur transition hover:border-white/30 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Start over
          </button>

          <div className="w-8" />
        </header>

        {/* Right column — Approved (Generated) */}
        <aside className="absolute right-4 top-4 bottom-4 z-20 flex w-[320px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur shadow-[0_28px_110px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-200">
              <BookmarkCheck className="h-3.5 w-3.5" />
              Generated
              <span className="ml-1 rounded-full border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-[10px] tracking-normal text-zinc-300">
                {approvedVideos.length}
              </span>
            </div>
            <History className="h-4 w-4 text-zinc-500" />
          </div>

          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div>
              <p className="text-xs text-zinc-400">Approved videos</p>
              <p className="text-sm font-medium text-white">Approved outputs</p>
            </div>
            <button
              type="button"
              onClick={() => {
                // Always continue from the latest completed render, regardless
                // of what's currently in preview. This makes the + icon a clear
                // "make another shot that continues the previous one" action.
                const latest = completedVideos[completedVideos.length - 1]
                if (!latest) {
                  setComposerError('No video to continue from yet.')
                  return
                }
                setPreviewVideoId(latest.id)
                // Defer one tick so previewVideo memo picks up the new id
                // before the continuation routine reads it.
                setTimeout(() => { editAndReusePreviousClip() }, 0)
              }}
              disabled={completedVideos.length === 0}
              title="Continue from the latest video"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition ${
                completedVideos.length > 0
                  ? 'border-white/15 bg-zinc-900 text-zinc-200 hover:border-emerald-400/40 hover:text-white'
                  : 'cursor-not-allowed border-white/5 text-zinc-600'
              }`}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {approvedVideos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-zinc-900/40 px-3 py-6 text-center text-xs text-zinc-500">
                No approved videos yet.
              </div>
            ) : (
              approvedVideos.map((video, index) => {
                const isActive = previewVideo?.id === video.id
                return (
                  <div
                    key={video.id}
                    className={`group relative rounded-xl border bg-zinc-900/70 p-2 transition ${
                      isActive
                        ? 'border-emerald-400/60 ring-1 ring-emerald-400/20'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="absolute left-3 top-3 z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-100">
                      #{index + 1}
                    </div>
                    <button
                      type="button"
                      onClick={() => startPreviewVideo(video.id)}
                      className="block w-full overflow-hidden rounded-lg bg-black"
                    >
                      <video
                        src={video.video!.storage_path}
                        muted
                        playsInline
                        controls
                        className="aspect-video w-full bg-black object-contain"
                      />
                    </button>

                    <div className="mt-2 flex items-start justify-between gap-2 px-1">
                      <p className="line-clamp-2 flex-1 text-xs leading-5 text-zinc-200">
                        {stripAttachedFilesBlock(video.input_prompt) || 'Untitled'}
                      </p>
                      <div className="flex shrink-0 items-center gap-1 text-zinc-400">
                        <button
                          type="button"
                          onClick={() => toggleApproved(video.id)}
                          title="Remove from approved"
                          className="rounded p-1 transition hover:bg-white/5 hover:text-white"
                        >
                          <BookmarkCheck className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={editAndReusePreviousClip}
                          title="Edit and continue"
                          className="rounded p-1 transition hover:bg-white/5 hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCard(video.id)}
                          title="Delete"
                          className="rounded p-1 transition hover:bg-rose-500/10 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-zinc-500">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${getStatusDotClassName(video.status)}`} />
                        {formatStatusLabel(video.status)}
                      </span>
                      <span>{formatCreatedAt(video.created_at)}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </aside>

        {/* Left slide-in panel — Generated videos */}
        {isApprovedPanelOpen ? (
          <aside className="absolute left-4 top-16 bottom-4 z-30 flex w-[340px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 backdrop-blur shadow-[0_28px_110px_rgba(0,0,0,0.55)]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-200">
                <LayoutGrid className="h-3.5 w-3.5" />
                Generated videos
                <span className="ml-1 rounded-full border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-[10px] tracking-normal text-zinc-300">
                  {completedVideos.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsApprovedPanelOpen(false)}
                className="rounded p-1 text-zinc-400 transition hover:bg-white/5 hover:text-white"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {completedVideos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-zinc-900/40 px-3 py-6 text-center text-xs text-zinc-500">
                  No videos generated yet.
                </div>
              ) : (
                completedVideos.map((video, index) => {
                  const isActive = previewVideo?.id === video.id
                  const approved = approvedIds.has(video.id)
                  return (
                    <div
                      key={video.id}
                      className={`group relative rounded-xl border bg-zinc-900/70 p-2 transition ${
                        isActive
                          ? 'border-emerald-400/60 ring-1 ring-emerald-400/20'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="absolute left-3 top-3 z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-100">
                        #{index + 1}
                      </div>
                      <button
                        type="button"
                        onClick={() => startPreviewVideo(video.id)}
                        className="block w-full overflow-hidden rounded-lg bg-black"
                      >
                        <video
                          src={video.video!.storage_path}
                          muted
                          playsInline
                          controls
                          className="aspect-video w-full bg-black object-contain"
                        />
                      </button>

                      <div className="mt-2 flex items-start justify-between gap-2 px-1">
                        <p className="line-clamp-2 flex-1 text-xs leading-5 text-zinc-200">
                          {stripAttachedFilesBlock(video.input_prompt) || 'Untitled'}
                        </p>
                        <div className="flex shrink-0 items-center gap-1 text-zinc-400">
                          <button
                            type="button"
                            onClick={() => toggleApproved(video.id)}
                            title={approved ? 'Remove approval' : 'Approve and add to generated'}
                            className={`rounded p-1 transition hover:bg-white/5 hover:text-white ${
                              approved ? 'text-emerald-300' : ''
                            }`}
                          >
                            {approved ? (
                              <BookmarkCheck className="h-3.5 w-3.5" />
                            ) : (
                              <BookmarkPlus className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteCard(video.id)}
                            title="Delete"
                            className="rounded p-1 transition hover:bg-rose-500/10 hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-zinc-500">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${getStatusDotClassName(video.status)}`} />
                          {formatStatusLabel(video.status)}
                        </span>
                        <span>{formatCreatedAt(video.created_at)}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </aside>
        ) : null}

        {/* Left column — User profile */}
        {isProfilePanelOpen ? (
          <aside
            className="absolute left-4 top-16 bottom-4 z-30 flex w-[340px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 backdrop-blur shadow-[0_28px_110px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-200">
                <User className="h-3.5 w-3.5" />
                User profile
              </div>
              <button
                type="button"
                onClick={() => setIsProfilePanelOpen(false)}
                className="rounded p-1 text-zinc-400 transition hover:bg-white/5 hover:text-white"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/60 p-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-zinc-800 text-zinc-200">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-100">
                    {profile?.email ?? session?.user?.email ?? '—'}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {profile?.role === 'admin' ? 'Admin' : 'User'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Credits</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
                    {profile?.credits_balance ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Videos</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
                    {completedVideos.length}
                  </p>
                </div>
              </div>

              {profile?.created_at ? (
                <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Member since</p>
                  <p className="mt-1 text-xs text-zinc-300">
                    {new Date(profile.created_at).toLocaleDateString('en-US')}
                  </p>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  void signOut()
                  setIsProfilePanelOpen(false)
                }}
                disabled={authLoading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200 transition hover:border-rose-400/50 hover:bg-rose-500/20 disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </aside>
        ) : null}

        {/* Center stage: video preview + caption */}
        <main className="flex min-h-screen w-full items-center justify-center px-6 pb-56 pt-24">
          <div className="w-full max-w-[1100px] pr-[340px]">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black shadow-[0_28px_80px_rgba(0,0,0,0.5)]">
              {previewVideo?.video?.storage_path ? (
                <video
                  key={previewVideo.video.storage_path}
                  src={previewVideo.video.storage_path}
                  controls
                  autoPlay
                  playsInline
                  className="aspect-video w-full bg-black object-contain"
                />
              ) : (
                <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-black text-zinc-600">
                  {previewVideo && normalizeStatus(previewVideo.status) !== 'failed' ? (
                    (() => {
                      const pct = getJobProgressPercent(previewVideo)
                      return (
                        <>
                          <LoaderCircle className="h-8 w-8 animate-spin text-zinc-400" />
                          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                            Generating video…
                          </p>
                          {typeof pct === 'number' ? (
                            <div className="mt-2 flex w-48 flex-col items-center gap-1.5">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                                <div
                                  className="h-full rounded-full bg-emerald-400/80 transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-[11px] tabular-nums text-zinc-300">{pct}%</span>
                            </div>
                          ) : null}
                        </>
                      )
                    })()
                  ) : previewVideo && normalizeStatus(previewVideo.status) === 'failed' ? (
                    <>
                      <X className="h-8 w-8 text-rose-400" />
                      <p className="text-xs uppercase tracking-[0.22em] text-rose-300">
                        Video generation failed
                      </p>
                    </>
                  ) : (
                    <>
                      <LayoutGrid className="h-8 w-8 text-zinc-700" />
                      <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                        Generated video preview will appear here
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-4 px-1 text-xs text-zinc-400">
              <p className="line-clamp-1 flex-1">
                {previewVideo
                  ? stripAttachedFilesBlock(previewVideo.input_prompt) || 'بدون عنوان'
                  : 'هنوز ویدئویی ساخته نشده است.'}
              </p>
              {previewVideo ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900/70 px-2.5 py-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${getStatusDotClassName(previewVideo.status)}`} />
                  {formatStatusLabel(previewVideo.status)}
                </span>
              ) : null}
            </div>
          </div>
        </main>

        {/* Floating bottom composer */}
        <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-6 pr-[360px]">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-[640px] rounded-[28px] border border-white/10 bg-zinc-900/85 p-3 shadow-[0_28px_80px_rgba(0,0,0,0.55)] backdrop-blur"
          >
            {/* Row 1: mode + duration */}
            <div className="flex items-center justify-between gap-3 px-2 pt-1">
              <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-zinc-950/70 p-0.5 text-[11px]">
                {([
                  { label: 'Text to Video', value: 'text-to-video' },
                  { label: 'Image to Video', value: 'image-to-video' },
                ] as const).map((option) => {
                  const isSelected = generationMode === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setGenerationMode(option.value)}
                      className={`rounded-full px-3 py-1.5 transition ${
                        isSelected ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>

              <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-zinc-950/70 p-0.5 text-[11px]">
                {([5, 10] as const).map((seconds) => {
                  const isSelected = durationSeconds === seconds
                  return (
                    <button
                      key={seconds}
                      type="button"
                      onClick={() => setDurationSeconds(seconds)}
                      className={`rounded-full px-3 py-1.5 transition ${
                        isSelected ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {seconds}s
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Row 2: Start » End */}
            {!isTextToVideo ? (
              <div className="mt-3 flex items-center justify-center gap-2 px-2">
                <button
                  type="button"
                  onClick={() => triggerFilePicker('Start')}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                    readyStartFrame
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                      : 'border-white/10 bg-zinc-950/60 text-zinc-300 hover:border-white/20 hover:text-white'
                  }`}
                >
                  Start
                  <FileUp className="h-3.5 w-3.5" />
                </button>
                <ChevronsRight className="h-4 w-4 text-zinc-600" />
                <button
                  type="button"
                  onClick={() => triggerFilePicker('End')}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                    readyEndFrame
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                      : 'border-white/10 bg-zinc-950/60 text-zinc-300 hover:border-white/20 hover:text-white'
                  }`}
                >
                  End
                  <FileUp className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            {/* Attached file chips */}
            {uploadedFiles.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5 px-2">
                {uploadedFiles.map((file) => (
                  <span
                    key={file.id}
                    className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] ${
                      file.status === 'failed'
                        ? 'border-rose-500/40 bg-rose-500/10 text-rose-100'
                        : 'border-white/10 bg-zinc-950/70 text-zinc-300'
                    }`}
                  >
                    <Paperclip className="h-3 w-3" />
                    <span className="max-w-[140px] truncate">{file.name}</span>
                    <span className="text-zinc-500">{file.target}</span>
                    <button
                      type="button"
                      onClick={() => removeUploadedFile(file.id)}
                      className="text-zinc-500 hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            {/* Row 3: prompt + submit */}
            <div className="mt-3 flex items-end gap-2 rounded-2xl border border-white/10 bg-zinc-950/70 px-3 py-2">
              <textarea
                ref={promptInputRef}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="What do you want to forge?"
                rows={1}
                className="min-h-[36px] flex-1 resize-none bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ;(e.currentTarget.form as HTMLFormElement | null)?.requestSubmit()
                  }
                }}
              />
              <button
                type="submit"
                disabled={!canSubmit}
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
                  canSubmit
                    ? 'bg-white text-black hover:bg-emerald-300'
                    : 'cursor-not-allowed bg-zinc-800 text-zinc-600'
                }`}
              >
                {isSubmitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
              </button>
            </div>

            {composerError ? (
              <p className="mt-2 px-2 text-[11px] text-rose-300">{composerError}</p>
            ) : blockedReason && hasComposerInput ? (
              <p className="mt-2 px-2 text-[11px] text-zinc-500">{blockedReason}</p>
            ) : null}
          </form>
        </div>

        {/* Merge progress chip (top-center, below header) */}
        {isMerging && mergeProgress > 0 ? (
          <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-1.5 text-xs text-emerald-100 backdrop-blur">
            Merging… {mergeProgress}%
          </div>
        ) : null}

        {/* Non-blocking column message */}
        {videoColumnMessage ? (
          <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs text-amber-100 backdrop-blur">
            {videoColumnMessage}
          </div>
        ) : null}
      </div>
    </div>
  )
}
