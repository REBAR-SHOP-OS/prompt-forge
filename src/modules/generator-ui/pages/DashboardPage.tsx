import { Fragment, type ChangeEvent, type FormEvent, type SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react'
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
  GripVertical,
  Hammer,
  History,
  LayoutGrid,
  Library,
  LoaderCircle,
  Lock,
  LogOut,
  Music,
  Music2,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'

import { ApiError } from '@/core/api/client'
import { useAuth } from '@/core/auth/AuthProvider'
import { supabase } from '@/integrations/supabase/client'
import WelcomeVideoOverlay from '@/modules/generator-ui/components/WelcomeVideoOverlay'
import { SoundtrackWaveform, type SoundtrackWaveformHandle } from '@/modules/generator-ui/components/SoundtrackWaveform'
import { TransitionPreview } from '@/modules/generator-ui/components/TransitionPreview'
import type { CreateJobResult, JobDetail, JobSummary } from '@/modules/job-orchestrator/contract'
import { jobOrchestratorGateway } from '@/modules/job-orchestrator/gateway'
import { mergeVideoUrls, type TransitionId, type TransitionSpec } from '@/modules/generator-ui/lib/mergeVideos'

const TRANSITION_OPTIONS: { id: TransitionId; label: string; durationMs: number }[] = [
  { id: 'cut', label: 'Cut', durationMs: 0 },
  { id: 'fade', label: 'Fade', durationMs: 500 },
  { id: 'crossfade', label: 'Crossfade', durationMs: 500 },
  { id: 'slide-left', label: 'Slide ←', durationMs: 500 },
  { id: 'slide-right', label: 'Slide →', durationMs: 500 },
  { id: 'wipe', label: 'Wipe', durationMs: 500 },
  { id: 'zoom', label: 'Zoom', durationMs: 500 },
]
const TRANSITION_LABEL: Record<TransitionId, string> = TRANSITION_OPTIONS.reduce(
  (acc, o) => { acc[o.id] = o.label; return acc },
  {} as Record<TransitionId, string>,
)
const TRANSITION_DURATION: Record<TransitionId, number> = TRANSITION_OPTIONS.reduce(
  (acc, o) => { acc[o.id] = o.durationMs; return acc },
  {} as Record<TransitionId, number>,
)
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
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false)
  // Live-measured vertical budget for the preview stage. The composer is
  // position:fixed at the bottom and its height changes (textarea rows, error
  // line, ratio chips wrapping). We observe its top edge and reserve that
  // much room for the preview so the video card never slides under the chat.
  const composerRef = useRef<HTMLFormElement | null>(null)
  const [previewMaxHeightPx, setPreviewMaxHeightPx] = useState<number>(() => {
    if (typeof window === 'undefined') return 600
    return Math.max(240, window.innerHeight - 320)
  })
  useEffect(() => {
    const SAFE_GAP = 24 // breathing room between preview card and composer
    const TOP_RESERVE = 56 // top header strip (Start Over / Final Film / Music)
    const recompute = () => {
      const el = composerRef.current
      const vh = window.innerHeight
      if (!el) {
        setPreviewMaxHeightPx(Math.max(240, vh - 320))
        return
      }
      const top = el.getBoundingClientRect().top
      const budget = Math.max(240, top - TOP_RESERVE - SAFE_GAP)
      setPreviewMaxHeightPx(budget)
    }
    recompute()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recompute) : null
    if (ro && composerRef.current) ro.observe(composerRef.current)
    window.addEventListener('resize', recompute)
    return () => {
      window.removeEventListener('resize', recompute)
      if (ro) ro.disconnect()
    }
  }, [])
  const [videoColumnMessage, setVideoColumnMessage] = useState<string | null>(null)
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>('Start')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null)
  const [isApprovedPanelOpen, setIsApprovedPanelOpen] = useState(false)
  const [generationMode, setGenerationMode] = useState<'image-to-video' | 'text-to-video'>('image-to-video')
  const [durationSeconds, setDurationSeconds] = useState<5 | 10 | 15>(5)
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '16:9'>(() => {
    if (typeof window === 'undefined') return '16:9'
    try {
      const v = window.localStorage.getItem('generator:aspectRatio')
      if (v === '9:16' || v === '1:1' || v === '16:9') return v
    } catch { /* ignore */ }
    return '16:9'
  })
  useEffect(() => {
    try { window.localStorage.setItem('generator:aspectRatio', aspectRatio) } catch { /* ignore */ }
  }, [aspectRatio])
  // Per-job aspect ratio map so the preview chrome matches the clip exactly,
  // even before the asset row carries `aspect_ratio`. Persisted in localStorage.
  type Ratio = '9:16' | '1:1' | '16:9'
  const [clipAspectRatios, setClipAspectRatios] = useState<Record<string, Ratio>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const raw = window.localStorage.getItem('generator:clipAspectRatios')
      if (!raw) return {}
      const parsed = JSON.parse(raw) as Record<string, Ratio>
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch { return {} }
  })
  const rememberClipRatio = (id: string, r: Ratio) => {
    setClipAspectRatios((curr) => {
      if (curr[id] === r) return curr
      const next = { ...curr, [id]: r }
      try { window.localStorage.setItem('generator:clipAspectRatios', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  const normalizeRatio = (v: unknown): Ratio | null => {
    if (v === '9:16' || v === '1:1' || v === '16:9') return v
    if (typeof v === 'string') {
      // provider sometimes returns "720P"; ignore non-standard values
      const m = v.match(/^(\d+):(\d+)$/)
      if (m) {
        const key = `${m[1]}:${m[2]}` as Ratio
        if (key === '9:16' || key === '1:1' || key === '16:9') return key
      }
    }
    return null
  }
  const getRatioFor = (video: { id: string; video?: { aspect_ratio?: string | null } | null } | null | undefined): Ratio => {
    if (!video) return aspectRatio
    const local = clipAspectRatios[video.id]
    if (local) return local
    const fromAsset = normalizeRatio(video.video?.aspect_ratio ?? null)
    return fromAsset ?? '16:9'
  }
  const ratioToCss = (r: Ratio): string => (r === '9:16' ? '9 / 16' : r === '1:1' ? '1 / 1' : '16 / 9')
  // Vertical budget is live-measured from the composer's top edge (see
  // previewMaxHeightPx above). We pass it as a px value into both the height
  // and width helpers so every aspect ratio respects the same hard ceiling.
  const PREVIEW_MAX_HEIGHT = `${previewMaxHeightPx}px`
  const ratioToHeight = (r: Ratio): string => {
    if (r === '9:16') return `min(${PREVIEW_MAX_HEIGHT}, calc((100vw - 56rem) * 16 / 9))`
    if (r === '1:1') return `min(${PREVIEW_MAX_HEIGHT}, calc(100vw - 56rem))`
    return `min(${PREVIEW_MAX_HEIGHT}, calc((100vw - 56rem) * 9 / 16))`
  }
  const ratioToWidth = (r: Ratio): string => {
    if (r === '9:16') return `min(calc(100vw - 56rem), calc(${PREVIEW_MAX_HEIGHT} * 9 / 16))`
    if (r === '1:1') return `min(calc(100vw - 56rem), ${PREVIEW_MAX_HEIGHT})`
    return `min(calc(100vw - 56rem), calc(${PREVIEW_MAX_HEIGHT} * 16 / 9))`
  }
  // Project-level ratio lock: once the first clip of a project is created,
  // every subsequent clip in the same project must use the same aspect ratio.
  // Cleared by Start Over.
  const [lockedProjectRatio, setLockedProjectRatio] = useState<Ratio | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const v = window.localStorage.getItem('generator:lockedProjectRatio')
      if (v === '9:16' || v === '1:1' || v === '16:9') return v
    } catch { /* ignore */ }
    return null
  })
  const persistLockedRatio = (r: Ratio | null) => {
    try {
      if (r) window.localStorage.setItem('generator:lockedProjectRatio', r)
      else window.localStorage.removeItem('generator:lockedProjectRatio')
    } catch { /* ignore */ }
  }
  // NOTE: Aspect ratio selector is always free for the user to change.
  // `lockedProjectRatio` is kept only for Final Film merge/preview consistency,
  // not to override the user's per-clip selection.
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
  const [manualOrder, setManualOrder] = useState<string[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [transitions, setTransitions] = useState<Record<string, TransitionId>>({})
  const [mergedEntries, setMergedEntries] = useState<JobDetail[]>([])
  const [isMerging, setIsMerging] = useState(false)
  const [mergeProgress, setMergeProgress] = useState<number>(0)
  // --- Background music for the Final Film ---
  const [musicName, setMusicName] = useState<string | null>(null)
  const [musicUrl, setMusicUrl] = useState<string | null>(null)
  const [musicDuration, setMusicDuration] = useState<number>(0)
  const [musicRange, setMusicRange] = useState<[number, number]>([0, 0])
  const [isMusicDialogOpen, setIsMusicDialogOpen] = useState(false)
  const musicFileInputRef = useRef<HTMLInputElement | null>(null)
  const musicPreviewAudioRef = useRef<HTMLAudioElement | null>(null)
  const musicWaveformRef = useRef<SoundtrackWaveformHandle | null>(null)
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

  const handleEnhancePrompt = async () => {
    const current = promptText.trim()
    if (!current || isEnhancingPrompt || isSubmitting) return
    setIsEnhancingPrompt(true)
    setComposerError(null)
    try {
      const imageUrls = [readyStartFrame?.url, readyEndFrame?.url].filter(
        (u): u is string => typeof u === 'string' && u.length > 0,
      )
      const { data, error } = await supabase.functions.invoke('enhance-prompt', {
        body: { prompt: current, imageUrls },
      })
      if (error) {
        const ctx = (error as unknown as { context?: { status?: number } })?.context
        const status = ctx?.status
        if (status === 429) setComposerError('Rate limit reached. Try again in a moment.')
        else if (status === 402) setComposerError('AI credits exhausted. Add credits to continue.')
        else setComposerError('Could not enhance prompt. Please try again.')
        return
      }
      const enhanced = (data as { enhancedPrompt?: string } | null)?.enhancedPrompt?.trim()
      if (!enhanced) {
        setComposerError('Could not enhance prompt. Please try again.')
        return
      }
      setPromptText(enhanced)
    } catch {
      setComposerError('Could not enhance prompt. Please try again.')
    } finally {
      setIsEnhancingPrompt(false)
    }
  }
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

  // Right-panel display order: oldest first (chronological ASC), with manual drag-and-drop overrides.
  const displayedVideos = useMemo(() => {
    const filtered = generatedVideos.filter((v) => !deletedIds.has(v.id))
    const chronoAsc = [...filtered].sort(
      (l, r) => new Date(l.created_at).getTime() - new Date(r.created_at).getTime()
    )
    if (!manualOrder) return chronoAsc
    const byId = new Map(chronoAsc.map((v) => [v.id, v]))
    const ordered: typeof chronoAsc = []
    for (const id of manualOrder) {
      const v = byId.get(id)
      if (v) {
        ordered.push(v)
        byId.delete(id)
      }
    }
    for (const v of chronoAsc) {
      if (byId.has(v.id)) ordered.push(v)
    }
    return ordered
  }, [generatedVideos, deletedIds, manualOrder])

  const handleCardDragStart = (id: string) => (event: React.DragEvent) => {
    setDraggingId(id)
    event.dataTransfer.effectAllowed = 'move'
    try { event.dataTransfer.setData('text/plain', id) } catch {}
  }
  const handleCardDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }
  const handleCardDrop = (targetId: string) => (event: React.DragEvent) => {
    event.preventDefault()
    const sourceId = draggingId || event.dataTransfer.getData('text/plain')
    setDraggingId(null)
    if (!sourceId || sourceId === targetId) return
    const currentIds = displayedVideos.map((v) => v.id)
    const from = currentIds.indexOf(sourceId)
    const to = currentIds.indexOf(targetId)
    if (from === -1 || to === -1) return
    const next = [...currentIds]
    next.splice(from, 1)
    next.splice(to, 0, sourceId)
    setManualOrder(next)
  }
  const handleCardDragEnd = () => setDraggingId(null)


  const previewVideo = useMemo(() => {
    if (visibleVideos.length === 0) {
      return null
    }

    return (
      visibleVideos.find((video) => video.id === previewVideoId) ??
      visibleVideos.find((video) => video.video?.storage_path) ??
      visibleVideos[0]
    )
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

          const mergeRes = await mergeVideoUrls([proxiedSrc, stillPublic])
          const mergedPath = `${userId}/with-end-${Date.now()}-${crypto.randomUUID()}.${mergeRes.extension}`
          const { error: upErr } = await supabase.storage
            .from(MERGED_BUCKET)
            .upload(mergedPath, mergeRes.blob, { contentType: mergeRes.mimeType, upsert: false })
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

          // Prepend: still clip first, then the generated video.
          const mergeRes = await mergeVideoUrls([stillPublic, proxiedSrc])
          const mergedPath = `${userId}/with-start-${Date.now()}-${crypto.randomUUID()}.${mergeRes.extension}`
          const { error: upErr } = await supabase.storage
            .from(MERGED_BUCKET)
            .upload(mergedPath, mergeRes.blob, { contentType: mergeRes.mimeType, upsert: false })
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

  // Smooth progress ticker: re-render once per second while any job is active
  // so the time-based progress bar advances visibly between API polls.
  const [, setProgressTick] = useState(0)
  useEffect(() => {
    const hasActive = generatedVideos.some((job) => !isTerminalStatus(job.status))
    if (!hasActive) return
    const id = window.setInterval(() => setProgressTick((tick) => tick + 1), 1000)
    return () => window.clearInterval(id)
  }, [generatedVideos])

  function openFileUpload(target: UploadTarget) {
    setUploadTarget(target)
    fileInputRef.current?.click()
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
      error: null
    }))

    setUploadedFiles((currentFiles) => [...currentFiles, ...nextFiles])
    nextFiles.forEach((nextFile, index) => {
      uploadFrameFile(files[index], target, nextFile.id)
    })
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

      // The user's current selection always wins for per-clip generation.
      // (lockedProjectRatio still controls Final Film merge/preview only.)
      const effectiveRatio: Ratio = aspectRatio

      if (isTextToVideo) {
        createdJob = await jobOrchestratorGateway.createJob({
          providerKey: 'wan',
          requestedModel: 'wan2.7-t2v-2026-04-25',
          prompt: nextPrompt,
          durationSeconds,
          aspectRatio: effectiveRatio,
        })
      } else if (readyStartFrame?.url && readyEndFrame?.url) {
        // Both frames provided — standard image-to-video.
        createdJob = await jobOrchestratorGateway.createJob({
          providerKey: 'wan',
          prompt: nextPrompt,
          firstFrameUrl: readyStartFrame.url,
          lastFrameUrl: readyEndFrame.url,
          durationSeconds,
          aspectRatio: effectiveRatio,
        })
        seedFrames = { firstFrameUrl: readyStartFrame.url, lastFrameUrl: readyEndFrame.url }
      } else if (readyStartFrame?.url) {
        // Only Start: real image-to-video anchored on the Start frame so the
        // prompt is executed directly on the uploaded image.
        createdJob = await jobOrchestratorGateway.createJob({
          providerKey: 'wan',
          prompt: nextPrompt,
          firstFrameUrl: readyStartFrame.url,
          durationSeconds,
          aspectRatio: effectiveRatio,
        })
        seedFrames = { firstFrameUrl: readyStartFrame.url }
      } else if (readyEndFrame?.url) {
        // Only End: real image-to-video anchored on the End frame.
        createdJob = await jobOrchestratorGateway.createJob({
          providerKey: 'wan',
          prompt: nextPrompt,
          lastFrameUrl: readyEndFrame.url,
          durationSeconds,
          aspectRatio: effectiveRatio,
        })
        seedFrames = { lastFrameUrl: readyEndFrame.url }
      } else {
        setComposerError('Add a Start or End image before rendering.')
        return
      }

      const seededJob = buildSeededJob(nextPrompt, createdJob, seedFrames)
      rememberClipRatio(seededJob.id, effectiveRatio)
      // First clip in this project locks the ratio for the rest of the project.
      if (!lockedProjectRatio) {
        setLockedProjectRatio(effectiveRatio)
        persistLockedRatio(effectiveRatio)
      }

      if (pendingEndAppendUrl) {
        setPendingEndAppends((current) => {
          const next = { ...current, [seededJob.id]: pendingEndAppendUrl as string }
          persistPendingEndAppends(next)
          return next
        })
      }

      if (pendingStartPrependUrl) {
        setPendingStartPrepends((current) => {
          const next = { ...current, [seededJob.id]: pendingStartPrependUrl as string }
          persistPendingStartPrepends(next)
          return next
        })
      }

      setPreviewVideoId(seededJob.id)
      setGeneratedVideos((currentJobs) => mergeJob(currentJobs, seededJob))
      setPromptText('')
      setUploadedFiles([])
    } catch (error) {
      const message = error instanceof ApiError ? `${error.code}: ${error.message}` : 'Could not start video generation.'
      setComposerError(message)
      setVideoColumnMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function captureLastFrameAsBlob(videoUrl: string): Promise<Blob> {
    return await new Promise((resolve, reject) => {
      const v = document.createElement('video')
      v.crossOrigin = 'anonymous'
      v.muted = true
      v.playsInline = true
      v.preload = 'auto'
      v.src = videoUrl
      const onError = () => reject(new Error('Could not load previous video for continuation'))
      v.onerror = onError
      v.onloadedmetadata = () => {
        const target = Math.max(0, (Number.isFinite(v.duration) ? v.duration : 0) - 0.05)
        const onSeeked = () => {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = v.videoWidth || 1280
            canvas.height = v.videoHeight || 720
            const ctx = canvas.getContext('2d')
            if (!ctx) return reject(new Error('Canvas unavailable'))
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
            canvas.toBlob((blob) => {
              if (!blob) return reject(new Error('Could not capture last frame'))
              resolve(blob)
            }, 'image/png')
          } catch (err) {
            reject(err as Error)
          }
        }
        v.onseeked = onSeeked
        try {
          v.currentTime = target
        } catch {
          v.play().then(() => v.pause()).then(() => { v.currentTime = target }).catch(onError)
        }
      }
    })
  }

  async function handleAddVideoCard() {
    setPromptText('')
    setUploadedFiles([])
    setComposerError(null)
    setVideoColumnMessage(null)
    setUploadTarget('Start')
    setPreviewVideoId(null)

    // Continuity rule: each new card must continue the previous render.
    // Auto-seed the previous video's last frame as the Start frame.
    const prev = generatedVideos.find(
      (v) => !deletedIds.has(v.id)
        && normalizeStatus(v.status) === 'completed'
        && v.video?.storage_path,
    )

    if (prev?.video?.storage_path && userId) {
      setGenerationMode('image-to-video')
      const seedId = Date.now()
      const placeholder: UploadedFile = {
        id: seedId,
        name: `continuation-from-${prev.id.slice(0, 6)}.png`,
        size: 0,
        target: 'Start',
        type: 'image/png',
        status: 'uploading',
        url: null,
        error: null,
      }
      setUploadedFiles([placeholder])
      try {
        const proxied = await proxiedVideoUrl(prev.video.storage_path)
        const blob = await captureLastFrameAsBlob(proxied)
        const storagePath = `${userId}/start-${Date.now()}-${crypto.randomUUID()}.png`
        const { error } = await supabase.storage
          .from(FRAMES_BUCKET)
          .upload(storagePath, blob, { contentType: 'image/png', upsert: false })
        if (error) throw new Error(error.message)
        const { data } = supabase.storage.from(FRAMES_BUCKET).getPublicUrl(storagePath)
        setUploadedFiles((current) =>
          current.map((f) =>
            f.id === seedId
              ? { ...f, status: 'ready', url: data.publicUrl, size: blob.size }
              : f,
          ),
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not seed continuation frame'
        setUploadedFiles((current) => current.filter((f) => f.id !== seedId))
        setComposerError(`Continuation seed failed: ${msg}. Upload a Start frame manually.`)
      }
    }

    requestAnimationFrame(() => {
      promptInputRef.current?.focus()
      promptInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  async function editAndReuseJob(job: {
    id?: string
    input_prompt?: string
    first_frame_url?: string | null
    last_frame_url?: string | null
    status?: string
    video?: { storage_path?: string | null } | null
  }) {
    setComposerError(null)
    setVideoColumnMessage(null)
    // Continuation flow: the new prompt extends the clicked clip, so start
    // with an empty prompt and seed Start with this clip's LAST frame.
    setPromptText('')
    setUploadedFiles([])
    setUploadTarget('Start')
    setIsApprovedPanelOpen(false)
    setPreviewVideoId(null)

    const canContinue =
      Boolean(job.id)
      && Boolean(job.video?.storage_path)
      && normalizeStatus(job.status ?? '') === 'completed'
      && Boolean(userId)

    if (canContinue) {
      setGenerationMode('image-to-video')
      const seedId = Date.now()
      const placeholder: UploadedFile = {
        id: seedId,
        name: `continuation-from-${(job.id as string).slice(0, 6)}.png`,
        size: 0,
        target: 'Start',
        type: 'image/png',
        status: 'uploading',
        url: null,
        error: null,
      }
      setUploadedFiles([placeholder])
      try {
        const proxied = await proxiedVideoUrl(job.video!.storage_path as string)
        const blob = await captureLastFrameAsBlob(proxied)
        const storagePath = `${userId}/start-${Date.now()}-${crypto.randomUUID()}.png`
        const { error } = await supabase.storage
          .from(FRAMES_BUCKET)
          .upload(storagePath, blob, { contentType: 'image/png', upsert: false })
        if (error) throw new Error(error.message)
        const { data } = supabase.storage.from(FRAMES_BUCKET).getPublicUrl(storagePath)
        setUploadedFiles((current) =>
          current.map((f) =>
            f.id === seedId
              ? { ...f, status: 'ready', url: data.publicUrl, size: blob.size }
              : f,
          ),
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not seed continuation frame'
        setUploadedFiles((current) => current.filter((f) => f.id !== seedId))
        setComposerError(`Continuation seed failed: ${msg}. Upload a Start frame manually.`)
      }
    } else {
      // Fallback: clip not yet rendered → reuse original frames + prompt.
      const hasFrames = Boolean(job.first_frame_url || job.last_frame_url)
      if (hasFrames) {
        setGenerationMode('image-to-video')
        const seeds: UploadedFile[] = []
        const baseId = Date.now()
        if (job.first_frame_url) {
          seeds.push({
            id: baseId,
            name: 'reused-start.png',
            size: 0,
            target: 'Start',
            type: 'image/png',
            status: 'ready',
            url: job.first_frame_url,
            error: null,
          })
        }
        if (job.last_frame_url) {
          seeds.push({
            id: baseId + 1,
            name: 'reused-end.png',
            size: 0,
            target: 'End',
            type: 'image/png',
            status: 'ready',
            url: job.last_frame_url,
            error: null,
          })
        }
        setUploadedFiles(seeds)
        setUploadTarget(job.first_frame_url ? 'End' : 'Start')
        setPromptText(job.input_prompt ?? '')
      } else {
        setGenerationMode('text-to-video')
        setPromptText(job.input_prompt ?? '')
      }
    }

    requestAnimationFrame(() => {
      promptInputRef.current?.focus()
      promptInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  function formatTimeMS(s: number): string {
    if (!Number.isFinite(s) || s < 0) s = 0
    const m = Math.floor(s / 60)
    const ss = Math.floor(s % 60)
    return `${m}:${ss.toString().padStart(2, '0')}`
  }

  function handleMusicButtonClick() {
    if (musicUrl) {
      setIsMusicDialogOpen(true)
    } else {
      musicFileInputRef.current?.click()
    }
  }

  function handleMusicFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (musicUrl) {
      try { URL.revokeObjectURL(musicUrl) } catch { /* ignore */ }
    }
    const url = URL.createObjectURL(file)
    setMusicName(file.name)
    setMusicUrl(url)
    setMusicDuration(0)
    setMusicRange([0, 0])
    setIsMusicDialogOpen(true)
  }

  function handleMusicLoadedMetadata(e: SyntheticEvent<HTMLAudioElement>) {
    const dur = e.currentTarget.duration
    if (Number.isFinite(dur) && dur > 0) {
      setMusicDuration(dur)
      setMusicRange(([s, eEnd]) => {
        if (eEnd > s) return [s, Math.min(eEnd, dur)]
        return [0, dur]
      })
    }
  }

  function handleClearMusic() {
    if (musicUrl) {
      try { URL.revokeObjectURL(musicUrl) } catch { /* ignore */ }
    }
    setMusicName(null)
    setMusicUrl(null)
    setMusicDuration(0)
    setMusicRange([0, 0])
    setIsMusicDialogOpen(false)
  }

  function handlePreviewMusicRange() {
    musicWaveformRef.current?.playRange(musicRange[0], musicRange[1])
  }

  async function handleMergeAllVideos() {
    if (isMerging) return
    if (completedSourceVideos.length < 2) {
      setVideoColumnMessage('Need at least 2 finished videos to merge.')
      return
    }
    if (!userId) {
      setVideoColumnMessage('Sign in to merge videos.')
      return
    }
    setIsMerging(true)
    setMergeProgress(0)
    setVideoColumnMessage(null)
    try {
      // Use the right-panel display order (top → bottom) so "what you see is what gets merged"
      const completedIds = new Set(completedSourceVideos.map((v) => v.id))
      const orderedClips = displayedVideos.filter(
        (v) => completedIds.has(v.id) && v.video?.storage_path,
      )
      const rawUrls = orderedClips.map((v) => v.video!.storage_path)
      const urls = await Promise.all(rawUrls.map((u) => proxiedVideoUrl(u)))

      // Build per-gap transition specs (one entry per gap = clips - 1).
      const transitionsForMerge: TransitionSpec[] = orderedClips
        .slice(0, -1)
        .map((clip) => {
          const id = transitions[clip.id] ?? 'cut'
          return { id, durationMs: TRANSITION_DURATION[id] ?? 0 }
        })

      const audioOpt = musicUrl && musicRange[1] > musicRange[0]
        ? { src: musicUrl, startSec: musicRange[0], endSec: musicRange[1] }
        : undefined
      const mergeRes = await mergeVideoUrls(
        urls,
        (p) => setMergeProgress(Math.round(p.ratio * 100)),
        audioOpt,
        transitionsForMerge,
      )

      const filename = `merged-${Date.now()}.${mergeRes.extension}`
      const storagePath = `${userId}/${filename}`
      const { error: upErr } = await supabase.storage
        .from(MERGED_BUCKET)
        .upload(storagePath, mergeRes.blob, { contentType: mergeRes.mimeType, upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { data } = supabase.storage.from(MERGED_BUCKET).getPublicUrl(storagePath)
      const publicUrl = data.publicUrl

      const mergedId = `merged-${crypto.randomUUID()}`
      // The merged mp4 inherits the first source clip's intrinsic dimensions
      // (mergeVideos.ts uses videoWidth/Height of the first clip). Mirror that
      // here so the preview chrome matches what's actually in the file.
      const firstClipId = orderedClips[0]?.id
      const mergedRatio: Ratio = (firstClipId ? clipAspectRatios[firstClipId] : undefined) ?? aspectRatio
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
          aspect_ratio: mergedRatio,
          duration: null,
        },
      }
      rememberClipRatio(mergedId, mergedRatio)

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

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Merge failed'
      console.error('[merge] failed', err)
      setVideoColumnMessage(`Could not load source video for merge — please try again in a moment. (${msg})`)
    } finally {
      setIsMerging(false)
      setMergeProgress(0)
    }
  }

  function handleStartOver() {
    // Hide every History card by adding their IDs to the "deleted" set
    // (same mechanism the per-card delete uses; DB rows are kept).
    setDeletedIds((current) => {
      const next = new Set(current)
      for (const v of generatedVideos) next.add(v.id)
      for (const e of mergedEntries) next.add(e.id)
      if (deletedStorageKey) {
        try { window.localStorage.setItem(deletedStorageKey, JSON.stringify(Array.from(next))) } catch { /* ignore */ }
      }
      return next
    })
    // Wipe the merged Final Film(s) entirely so the preview goes blank
    // and the FINAL FILM tab disappears.
    setMergedEntries([])
    persistMerged([])
    // Clear approved selections + per-clip transitions + manual ordering.
    setApprovedIds(new Set())
    if (approvedStorageKey) {
      try { window.localStorage.setItem(approvedStorageKey, JSON.stringify([])) } catch { /* ignore */ }
    }
    setTransitions({})
    setManualOrder(null)
    setPendingEndAppends({})
    setPendingStartPrepends({})
    if (pendingEndAppendsKey) {
      try { window.localStorage.setItem(pendingEndAppendsKey, JSON.stringify({})) } catch { /* ignore */ }
    }
    if (pendingStartPrependsKey) {
      try { window.localStorage.setItem(pendingStartPrependsKey, JSON.stringify({})) } catch { /* ignore */ }
    }
    // Tear down the soundtrack so the audio chip in the top tabs disappears.
    if (musicUrl) {
      try { URL.revokeObjectURL(musicUrl) } catch { /* ignore */ }
    }
    setMusicName(null)
    setMusicUrl(null)
    setMusicDuration(0)
    setMusicRange([0, 0])
    setIsMusicDialogOpen(false)
    // Reset any in-flight merge progress UI.
    setIsMerging(false)
    setMergeProgress(0)
    // Reset the composer to a fresh state.
    setPromptText('')
    setUploadedFiles([])
    setComposerError(null)
    setVideoColumnMessage(null)
    setUploadTarget('Start')
    setGenerationMode('image-to-video')
    setDurationSeconds(5)
    setPreviewVideoId(null)
    // Releasing the project lock so the user can pick a different ratio.
    setLockedProjectRatio(null)
    persistLockedRatio(null)
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
      {showWelcome && <WelcomeVideoOverlay onClose={dismissWelcome} />}
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
        accept="image/*"
        onChange={handleFileInputChange}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="fixed left-4 top-4 z-50 grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-200/80 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-zinc-100 sm:left-5 sm:top-5"
            type="button"
            aria-label="Open menu"
          >
            <LayoutGrid className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="w-64">
          <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="truncate">{profile?.email ?? session?.user.email ?? 'Account'}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setIsApprovedPanelOpen(true)}>
            <Library className="mr-2 h-4 w-4" aria-hidden="true" />
            <span>Library</span>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {approvedIds.size}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled className="opacity-100 focus:bg-transparent">
            <Coins className="mr-2 h-4 w-4 text-amber-300/80" aria-hidden="true" />
            <span>Credits</span>
            <span className="ml-auto text-xs font-medium tabular-nums text-zinc-100">
              {profile?.credits_balance ?? '—'}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { void signOut() }} className="text-red-400 focus:text-red-300">
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 sm:top-5">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            className="flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs uppercase tracking-[0.18em] text-zinc-200/80 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-100"
            type="button"
            aria-label="Start over"
          >
            <RotateCcw className="h-[14px] w-[14px]" aria-hidden="true" />
            <span>Start over</span>
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start over?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears every card in History and resets the prompt, frames, mode, and duration.
              Saved videos in Your library are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStartOver}>Start over</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <button
        type="button"
        onClick={handleMergeAllVideos}
        disabled={isMerging || completedSourceVideos.length < 2}
        className="flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs uppercase tracking-[0.18em] text-zinc-200/80 transition hover:border-emerald-300/30 hover:bg-emerald-300/[0.06] hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Merge all cards into one final film"
        title={
          completedSourceVideos.length < 2
            ? 'Need at least 2 finished videos'
            : musicUrl
              ? `Final film with music (${formatTimeMS(musicRange[0])} – ${formatTimeMS(musicRange[1])})`
              : 'Merge all cards into one final film'
        }
      >
        {isMerging ? (
          <>
            <LoaderCircle className="h-[14px] w-[14px] animate-spin" aria-hidden="true" />
            <span className="tabular-nums">{mergeProgress}%</span>
          </>
        ) : (
          <>
            <Film className="h-[14px] w-[14px]" aria-hidden="true" />
            <span>Final film</span>
          </>
        )}
      </button>

      {/* Background music: pick an audio file + select a window. Applied as
          the soundtrack of the Final Film (clip audio is muted). */}
      <input
        ref={musicFileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleMusicFileChange}
      />
      <button
        type="button"
        onClick={handleMusicButtonClick}
        className="flex h-9 max-w-[220px] items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs uppercase tracking-[0.18em] text-zinc-200/80 transition hover:border-amber-300/30 hover:bg-amber-300/[0.06] hover:text-amber-100"
        aria-label={musicUrl ? 'Edit soundtrack' : 'Add soundtrack'}
        title={musicUrl ? 'Edit soundtrack' : 'Add a music file as soundtrack for the Final Film'}
      >
        {musicUrl ? (
          <>
            <Music2 className="h-[14px] w-[14px]" aria-hidden="true" />
            <span className="truncate normal-case tracking-normal">
              {musicName ?? 'Soundtrack'}
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label="Remove soundtrack"
              onClick={(ev) => { ev.stopPropagation(); handleClearMusic() }}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); handleClearMusic() } }}
              className="-mr-1 grid h-5 w-5 cursor-pointer place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </span>
          </>
        ) : (
          <>
            <Music className="h-[14px] w-[14px]" aria-hidden="true" />
            <span>Music</span>
          </>
        )}
      </button>

      <Dialog open={isMusicDialogOpen} onOpenChange={setIsMusicDialogOpen}>
        <DialogContent className="border-white/10 bg-black text-zinc-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Soundtrack for Final Film</DialogTitle>
            <DialogDescription>
              Pick a section of the audio. It will replace the audio of every clip
              in the merged Final Film.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs text-zinc-300">
              <div className="truncate font-medium">{musicName ?? '—'}</div>
              <div className="mt-0.5 text-zinc-500">
                Duration: {formatTimeMS(musicDuration)}
              </div>
            </div>

            {musicUrl ? (
              <SoundtrackWaveform
                ref={musicWaveformRef}
                url={musicUrl}
                range={musicRange[1] > musicRange[0] ? musicRange : [0, Math.max(0.1, musicDuration)]}
                onReady={(d) => {
                  setMusicDuration(d)
                  if (musicRange[1] <= musicRange[0]) {
                    setMusicRange([0, d])
                  }
                }}
                onRangeChange={(r) => {
                  if (r[1] > r[0]) setMusicRange([r[0], r[1]])
                }}
              />
            ) : (
              <p className="text-xs text-zinc-500">Loading audio…</p>
            )}

            {musicDuration > 0 ? (
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Selection</span>
                <span className="tabular-nums text-zinc-200">
                  {formatTimeMS(musicRange[0])} – {formatTimeMS(musicRange[1])}
                </span>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={handleClearMusic}>
              Remove
            </Button>
            <Button type="button" onClick={() => setIsMusicDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>

      <main
        className="grid place-items-center px-4"
        aria-live="polite"
        style={{ minHeight: `${previewMaxHeightPx + 56}px`, paddingTop: '56px' }}
      >
        {previewVideo ? (
          <div className="flex w-full justify-center">
            <div
              className="overflow-hidden rounded-[22px] border border-white/10 bg-[#07080a]/90 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur"
              style={{
                width: ratioToWidth(getRatioFor(previewVideo)),
                maxWidth: 'calc(100vw - 56rem)',
                maxHeight: `${previewMaxHeightPx}px`,
              }}
            >
              <div
                className="relative overflow-hidden bg-black"
                style={{
                  aspectRatio: ratioToCss(getRatioFor(previewVideo)),
                  height: ratioToHeight(getRatioFor(previewVideo)),
                  maxWidth: 'calc(100vw - 56rem)',
                }}
              >
                {previewVideo.video?.storage_path ? (
                  <video
                    key={previewVideo.id}
                    className="h-full w-full bg-black object-contain"
                    src={previewVideo.video.storage_path}
                    controls
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <div className="grid h-full place-items-center px-6 text-center">
                    {(() => {
                      const status = normalizeStatus(previewVideo.status)
                      const isRendering = status === 'processing' || status === 'pending'
                      const pct = isRendering ? getJobProgressPercent(previewVideo) ?? 0 : 0
                      const startedAt = Date.parse(previewVideo.created_at)
                      const longRender = Number.isFinite(startedAt) && Date.now() - startedAt > 240_000
                      return (
                        <div className="w-full max-w-sm">
                          {isRendering ? (
                            (() => {
                              const radius = 52
                              const circumference = 2 * Math.PI * radius
                              const dash = (Math.max(0, Math.min(100, pct)) / 100) * circumference
                              return (
                                <div
                                  className="relative mx-auto h-32 w-32"
                                  role="progressbar"
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={pct}
                                >
                                  <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
                                    <circle
                                      cx="60" cy="60" r={radius}
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="8"
                                      className="text-white/10"
                                    />
                                    <circle
                                      cx="60" cy="60" r={radius}
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="8"
                                      strokeLinecap="round"
                                      strokeDasharray={`${dash} ${circumference}`}
                                      className="text-amber-300 transition-[stroke-dasharray] duration-500"
                                    />
                                  </svg>
                                  <div className="absolute inset-0 grid place-items-center">
                                    <span className="text-2xl font-semibold tabular-nums text-zinc-100">{pct}%</span>
                                  </div>
                                </div>
                              )
                            })()
                          ) : (
                            <Clapperboard className="mx-auto h-10 w-10 text-zinc-600" aria-hidden="true" />
                          )}
                          <p className="mt-4 text-sm font-semibold text-zinc-300">{formatStatusLabel(previewVideo.status)}</p>
                          {isRendering ? (
                            <p className="mt-2 text-xs leading-5 text-zinc-500">
                              {longRender
                                ? 'Still rendering — provider is taking longer than usual.'
                                : `About ${Math.max(0, 100 - pct)}% remaining`}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs leading-5 text-zinc-600">Waiting for render output.</p>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-h-12 min-w-0 flex-1 overflow-hidden whitespace-normal break-words text-sm font-medium leading-6 text-zinc-200">
                  {previewVideo.input_prompt}
                </p>
                <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-400">
                  <span className={`h-1.5 w-1.5 rounded-full ${getStatusDotClassName(previewVideo.status)}`} />
                  {formatStatusLabel(previewVideo.status)}
                  {(() => {
                    const status = normalizeStatus(previewVideo.status)
                    if (status !== 'processing' && status !== 'pending') return null
                    const pct = getJobProgressPercent(previewVideo)
                    return pct !== null ? <span className="tabular-nums text-amber-300">{pct}%</span> : null
                  })()}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="-translate-y-10 text-center sm:-translate-y-8">
            <div className="relative mx-auto mb-4 grid h-14 w-14 place-items-center text-zinc-100" aria-hidden="true">
              <Hammer className="h-10 w-10 -rotate-12 stroke-[1.7]" />
              <Sparkles className="absolute right-0 top-0 h-5 w-5 text-amber-300 stroke-[1.8]" />
            </div>
            <p className="m-0 text-base font-medium text-zinc-400 sm:text-lg">{emptyStateLabel}</p>
          </div>
        )}
      </main>

      <aside
        className="fixed bottom-3 right-3 top-3 z-30 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-[22px] border border-white/10 bg-[#0b0c0e]/90 p-3 shadow-[0_22px_70px_rgba(0,0,0,0.36)] backdrop-blur-xl sm:bottom-5 sm:right-4 sm:top-5 sm:w-80 lg:w-80 xl:right-5 xl:w-96 2xl:w-[26rem]"
        aria-label="Recent outputs"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="inline-flex items-center gap-2">
            <History className="h-4 w-4 text-amber-300" aria-hidden="true" />
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">History</p>
            <span className="grid h-6 min-w-6 place-items-center rounded-full border border-white/10 px-2 text-xs font-semibold text-zinc-300">
              {generatedVideos.filter((v) => !deletedIds.has(v.id)).length}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-500">Video renders</p>
            <h2 className="text-sm font-semibold text-zinc-100">Recent outputs</h2>
          </div>
          <button
            type="button"
            onClick={handleAddVideoCard}
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-[#141518]/95 text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-100"
            aria-label="Add new video card"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {videoColumnMessage ? (
          <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-100">
            {videoColumnMessage}
          </div>
        ) : null}

        <div className="mt-3 flex-1 overflow-y-auto overflow-x-hidden pr-1">
          {isLibraryLoading ? (
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-white/10 px-5 text-center">
              <div>
                <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-zinc-500" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-zinc-300">Syncing render history</p>
                <p className="mt-2 text-xs leading-5 text-zinc-600">Recent outputs will appear here.</p>
              </div>
            </div>
          ) : displayedVideos.length > 0 ? (
            <div className="grid min-w-0 gap-3">
              {displayedVideos.map((video, index) => {
                const status = normalizeStatus(video.status)
                const isPreviewSelected = previewVideo?.id === video.id
                const isDragging = draggingId === video.id

                const isLast = index === displayedVideos.length - 1
                const transitionId: TransitionId = transitions[video.id] ?? 'cut'

                return (
                  <Fragment key={video.id}>
                  <article
                    draggable
                    onDragStart={handleCardDragStart(video.id)}
                    onDragOver={handleCardDragOver}
                    onDrop={handleCardDrop(video.id)}
                    onDragEnd={handleCardDragEnd}
                    className={`w-full min-w-0 cursor-pointer rounded-2xl border p-3 transition hover:border-white/20 hover:bg-white/[0.055] ${
                      isPreviewSelected ? 'border-white/20 bg-white/[0.06]' : 'border-white/10 bg-white/[0.035]'
                    } ${isDragging ? 'opacity-50' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Preview ${video.input_prompt}`}
                    onClick={() => setPreviewVideoId(video.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setPreviewVideoId(video.id)
                      }
                    }}
                  >
                    <div
                      className="relative w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#15171a]"
                      style={{ aspectRatio: ratioToCss(getRatioFor(video)) }}
                    >
                      {video.video?.storage_path ? (
                        <video
                          className="h-full w-full max-w-full bg-black object-cover"
                          src={video.video.storage_path}
                          poster={video.video.thumbnail_url ?? undefined}
                          controls
                          muted
                          playsInline
                          preload="auto"
                          onLoadedMetadata={(event) => {
                            const el = event.currentTarget
                            try {
                              if (el.currentTime === 0) {
                                const dur = Number.isFinite(el.duration) ? el.duration : 0
                                el.currentTime = dur > 0 ? Math.min(4, Math.max(0, dur - 0.05)) : 0.05
                              }
                            } catch { /* ignore */ }
                          }}
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-zinc-500">
                          <Clapperboard className="h-8 w-8" aria-hidden="true" />
                        </div>
                      )}
                      <span
                        className="pointer-events-none absolute left-2 top-2 grid h-6 min-w-6 place-items-center rounded-full bg-black/70 px-1.5 text-xs font-semibold tabular-nums text-white shadow-md ring-1 ring-white/15"
                        aria-label={`Card ${index + 1}`}
                      >
                        {index + 1}
                      </span>
                    </div>

                    <div className="mt-3 flex items-start justify-between gap-2">
                      <p className="max-h-12 min-w-0 flex-1 overflow-hidden whitespace-normal break-words text-sm font-medium leading-6 text-zinc-200">
                        {video.input_prompt}
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          onClick={(event) => event.stopPropagation()}
                          className="grid h-7 w-5 shrink-0 cursor-grab place-items-center text-zinc-500 transition hover:text-zinc-200 active:cursor-grabbing"
                          title="Drag to reorder"
                          aria-label="Drag to reorder"
                        >
                          <GripVertical className="h-4 w-4" aria-hidden="true" />
                        </span>
                        {status === 'processing' ? (
                          <LoaderCircle className="mt-1 h-4 w-4 shrink-0 animate-spin text-amber-300" aria-hidden="true" />
                        ) : status === 'completed' && video.video?.storage_path ? (
                          (() => {
                            const isApproved = approvedIds.has(video.id)
                            return (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  toggleApproved(video.id)
                                }}
                                aria-pressed={isApproved}
                                aria-label={isApproved ? 'Remove from library' : 'Save to library'}
                                title={isApproved ? 'Saved in library — click to remove' : 'Save to library'}
                                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border transition ${
                                  isApproved
                                    ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200 hover:bg-emerald-300/15'
                                    : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-zinc-100'
                                }`}
                              >
                                {isApproved ? (
                                  <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                ) : (
                                  <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                              </button>
                            )
                          })()
                        ) : null}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            editAndReuseJob(video)
                          }}
                          aria-label="Edit prompt and regenerate"
                          title="Edit prompt and regenerate"
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            deleteCard(video.id)
                          }}
                          aria-label="Delete card"
                          title="Delete card"
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:border-rose-300/40 hover:bg-rose-300/10 hover:text-rose-200"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${getStatusDotClassName(video.status)}`} />
                        {formatStatusLabel(video.status)}
                        {(status === 'processing' || status === 'pending') ? (
                          (() => {
                            const pct = getJobProgressPercent(video)
                            return pct !== null ? <span className="tabular-nums text-amber-300">{pct}%</span> : null
                          })()
                        ) : null}
                      </span>
                      <span>{formatCreatedAt(video.created_at)}</span>
                    </div>
                    {(status === 'processing' || status === 'pending') ? (
                      (() => {
                        const pct = getJobProgressPercent(video) ?? 0
                        return (
                          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-amber-300 transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        )
                      })()
                    ) : null}
                  </article>
                  {!isLast ? (
                    <div
                      className="flex items-center gap-2 px-1 text-xs text-zinc-500"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#141518]/95 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-white/25 hover:text-zinc-100"
                            title="Transition between these clips"
                            aria-label={`Transition: ${TRANSITION_LABEL[transitionId]}`}
                          >
                            <TransitionPreview id={transitionId} size={22} />
                            <span>{TRANSITION_LABEL[transitionId]}</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="center" className="min-w-[12rem]">
                          <DropdownMenuLabel>Transition</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {TRANSITION_OPTIONS.map((opt) => (
                            <DropdownMenuItem
                              key={opt.id}
                              onSelect={() => {
                                setTransitions((current) => ({ ...current, [video.id]: opt.id }))
                              }}
                              className={`flex items-center gap-2 ${transitionId === opt.id ? 'bg-white/[0.06] text-zinc-100' : ''}`}
                            >
                              <TransitionPreview id={opt.id} size={32} />
                              <span>{opt.label}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
                    </div>
                  ) : null}
                  </Fragment>
                )
              })}
            </div>
          ) : (
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-white/10 px-5 text-center">
              <div>
                <Film className="mx-auto h-8 w-8 text-zinc-600" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-zinc-300">No renders yet</p>
                <p className="mt-2 text-xs leading-5 text-zinc-600">New video generations will collect here.</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Left library panel — only opens via the LayoutGrid icon. Shows approved videos. */}
      <button
        type="button"
        aria-label="Close library"
        className={`fixed inset-0 z-20 bg-black/35 transition lg:hidden ${
          isApprovedPanelOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setIsApprovedPanelOpen(false)}
      />

      <aside
        className={`fixed bottom-3 left-3 top-3 z-40 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-[22px] border border-white/10 bg-[#0b0c0e]/95 p-3 shadow-[0_22px_70px_rgba(0,0,0,0.4)] backdrop-blur-xl transition duration-300 sm:bottom-5 sm:left-16 sm:top-5 sm:w-80 lg:w-80 xl:w-96 2xl:w-[26rem] ${
          isApprovedPanelOpen
            ? 'pointer-events-auto visible translate-x-0 opacity-100'
            : 'pointer-events-none invisible -translate-x-[calc(100%+1.25rem)] opacity-0'
        }`}
        aria-label="Library"
        aria-hidden={!isApprovedPanelOpen}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="inline-flex items-center gap-2">
            <Library className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Library</p>
            <span className="grid h-6 min-w-6 place-items-center rounded-full border border-white/10 px-2 text-xs font-semibold text-zinc-300">
              {visibleVideos.filter((v) => approvedIds.has(v.id)).length}
            </span>
          </div>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100"
            aria-label="Close library"
            onClick={() => setIsApprovedPanelOpen(false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium text-zinc-500">Saved videos</p>
          <h2 className="text-sm font-semibold text-zinc-100">Your library</h2>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto pr-1">
          {(() => {
            const approvedVideos = visibleVideos.filter((video) => approvedIds.has(video.id))
            if (approvedVideos.length === 0) {
              return (
                <div className="grid h-full place-items-center rounded-2xl border border-dashed border-white/10 px-5 text-center">
                  <div>
                    <Library className="mx-auto h-8 w-8 text-zinc-600" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-zinc-300">No saved videos yet</p>
                    <p className="mt-2 text-xs leading-5 text-zinc-600">
                      Approve a render from the right panel to keep it here.
                    </p>
                  </div>
                </div>
              )
            }
            return (
              <div className="grid gap-3">
                {approvedVideos.map((video) => {
                  const isPreviewSelected = previewVideo?.id === video.id
                  return (
                    <article
                      key={video.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-2.5 transition hover:border-white/20 hover:bg-white/[0.055] ${
                        isPreviewSelected ? 'border-emerald-300/30 bg-emerald-300/[0.04]' : 'border-white/10 bg-white/[0.035]'
                      }`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Preview ${video.input_prompt}`}
                      onClick={() => {
                        setPreviewVideoId(video.id)
                        setIsApprovedPanelOpen(false)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setPreviewVideoId(video.id)
                          setIsApprovedPanelOpen(false)
                        }
                      }}
                    >
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#15171a]">
                        {video.video?.storage_path ? (
                          <video
                            className="h-full w-full bg-black object-cover"
                            src={video.video.storage_path}
                            poster={video.video.thumbnail_url ?? undefined}
                            muted
                            playsInline
                            preload="auto"
                            onLoadedMetadata={(event) => {
                              const el = event.currentTarget
                              try {
                                if (el.currentTime === 0) {
                                  const dur = Number.isFinite(el.duration) ? el.duration : 0
                                  el.currentTime = dur > 0 ? Math.min(4, Math.max(0, dur - 0.05)) : 0.05
                                }
                              } catch { /* ignore */ }
                            }}
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-zinc-500">
                            <Clapperboard className="h-6 w-6" aria-hidden="true" />
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-2 min-w-0 flex-1 text-xs font-medium leading-5 text-zinc-200">
                            {video.input_prompt}
                          </p>
                          <div className="flex shrink-0 items-center gap-1">
                            {video.video?.storage_path ? (
                              <a
                                href={video.video.storage_path}
                                download
                                onClick={(event) => event.stopPropagation()}
                                aria-label="Download video"
                                title="Download video"
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200"
                              >
                                <Download className="h-3 w-3" aria-hidden="true" />
                              </a>
                            ) : null}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                deleteCard(video.id)
                              }}
                              aria-label="Delete card"
                              title="Delete card"
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-rose-300/40 hover:bg-rose-300/10 hover:text-rose-200"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                          <span className="inline-flex items-center gap-1.5">
                            <BookmarkCheck className="h-3 w-3 text-emerald-300" aria-hidden="true" />
                            Saved
                          </span>
                          <span className="tabular-nums">{formatCreatedAt(video.created_at)}</span>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </aside>

      <form
        ref={composerRef}
        className="fixed bottom-4 left-1/2 z-30 grid w-[min(96rem,calc(100vw-2rem))] -translate-x-1/2 gap-3 rounded-[22px] border border-white/10 bg-[#111214]/95 p-3 shadow-[0_22px_70px_rgba(0,0,0,0.48)] backdrop-blur-xl sm:bottom-[clamp(1rem,4.8vh,3.4rem)] sm:w-[min(96rem,calc(100vw-56rem))] sm:p-4"
        onSubmit={handleSubmit}
      >
        <div className="flex flex-wrap items-center gap-2" aria-label="Generation mode">
          <div role="tablist" aria-label="Choose generation mode" className="inline-flex rounded-full border border-white/10 bg-black/20 p-1 text-xs font-semibold">
            <button
              type="button"
              role="tab"
              aria-selected={isTextToVideo}
              onClick={() => {
                setGenerationMode('text-to-video')
                setComposerError(null)
              }}
              className={`rounded-full px-3 py-1.5 transition ${isTextToVideo ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Text to Video
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isTextToVideo}
              onClick={() => {
                setGenerationMode('image-to-video')
                setComposerError(null)
              }}
              className={`rounded-full px-3 py-1.5 transition ${!isTextToVideo ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Image to Video
            </button>
          </div>
          <div role="radiogroup" aria-label="Clip duration" className="inline-flex rounded-full border border-white/10 bg-black/20 p-1 text-xs font-semibold">
            {([5, 10, 15] as const).map((sec) => {
              const active = durationSeconds === sec
              return (
                <button
                  key={sec}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDurationSeconds(sec)}
                  className={`rounded-full px-3 py-1.5 transition ${active ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  {sec}s
                </button>
              )
            })}
          </div>
          <div role="radiogroup" aria-label="Aspect ratio" className="inline-flex items-center rounded-full border border-white/10 bg-black/20 p-1 text-xs font-semibold">
            {([
              { value: '9:16', label: '9:16', hint: 'Reels' },
              { value: '1:1', label: '1:1', hint: 'Post' },
              { value: '16:9', label: '16:9', hint: 'YouTube' },
            ] as const).map((opt) => {
              const active = aspectRatio === opt.value
              const isLocked = lockedProjectRatio !== null
              const disabled = isLocked && !active
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-disabled={disabled}
                  disabled={disabled}
                  onClick={() => { if (!disabled) setAspectRatio(opt.value) }}
                  title={
                    isLocked
                      ? (active
                          ? `${opt.label} — locked for this project. Use Start Over to change.`
                          : 'Locked to project ratio. Use Start Over to change.')
                      : `${opt.label} — ${opt.hint}`
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                    active
                      ? 'bg-zinc-100 text-zinc-950'
                      : disabled
                        ? 'cursor-not-allowed text-zinc-600'
                        : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span className={`text-[10px] uppercase tracking-wide ${active ? 'text-zinc-500' : 'text-zinc-500'}`}>{opt.hint}</span>
                  {active && isLocked ? (
                    <Lock className="h-3 w-3 text-zinc-500" aria-hidden="true" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        {!isTextToVideo ? (
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
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-3">
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

            {uploadedFiles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {uploadedFiles.map((file) => (
                  <span
                    key={file.id}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-zinc-300"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
                    <span className="max-w-[12rem] truncate">{file.name}</span>
                    <span className="text-zinc-500">{file.status === 'uploading' ? 'Uploading' : file.target}</span>
                    {file.status === 'failed' ? <span className="text-rose-200">{file.error}</span> : null}
                    <button
                      type="button"
                      className="grid h-4 w-4 place-items-center rounded-full text-zinc-500 transition hover:text-zinc-100"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => removeUploadedFile(file.id)}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            {composerError ? (
              <p className="text-xs leading-5 text-rose-300">{composerError}</p>
            ) : blockedReason && hasComposerInput ? (
              <p className="text-xs leading-5 text-zinc-500">{blockedReason}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <button
              type="button"
              onClick={handleEnhancePrompt}
              disabled={promptText.trim().length === 0 || isEnhancingPrompt || isSubmitting}
              aria-label="Enhance prompt with AI"
              className="inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-full border border-[#2a2d32] bg-black/20 px-4 text-sm font-semibold text-zinc-200/80 transition hover:border-amber-300/60 hover:bg-white/[0.05] hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#2a2d32] disabled:hover:bg-black/20 disabled:hover:text-zinc-200/80"
            >
              {isEnhancingPrompt ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              )}
              Prompt
            </button>

            <button
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
              type="submit"
              disabled={isSubmitting || hasUploadingFiles || isEnhancingPrompt}
              aria-label="Generate video"
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
