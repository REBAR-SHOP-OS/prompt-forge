import { Fragment, type ChangeEvent, type FormEvent, type SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BookmarkCheck,
  BookmarkPlus,
  ChevronsRight,
  Clapperboard,
  
  Combine,
  Download,
  FileUp,
  Film,
  GripVertical,
  Hammer,
  History,
  ImagePlus,
  LayoutGrid,
  Library,
  LoaderCircle,
  Lock,
  LogOut,
  Mic,
  MicOff,
  Music,
  Music2,
  SlidersHorizontal,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Scissors,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
import { generatorUiGateway } from '@/modules/generator-ui/gateway'
import { mergeVideoUrls, type TransitionId, type TransitionSpec } from '@/modules/generator-ui/lib/mergeVideos'
import ClipTrimmerDialog from '@/modules/generator-ui/components/ClipTrimmerDialog'
import { VoiceoverDialog } from '@/modules/generator-ui/components/VoiceoverDialog'

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

type UserImageItem = {
  id: string
  storage_path: string
  created_at: string
  still_duration_seconds: number
  width?: number | null
  height?: number | null
}

type UnifiedClip =
  | { kind: 'video'; id: string; createdAt: string; job: JobDetail }
  | { kind: 'image'; id: string; createdAt: string; image: UserImageItem }

const VIDEO_POLL_INTERVAL_MS = 4_000
const FRAMES_BUCKET = 'wan-frames'
const MERGED_BUCKET = 'merged-videos'
const USER_IMAGES_BUCKET = 'user-images'

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
  const status = normalizeStatus(job.status)
  if (status === 'completed') return 100
  if (status === 'failed' || status === 'cancelled') return null
  const startedAt = Date.parse(job.created_at)
  const elapsed = Number.isFinite(startedAt) ? Date.now() - startedAt : 0
  // Wan 2.7 typically takes ~30-40s of real time per 1s of output. Use 35s/s heuristic, capped to 10s clips.
  const expectedMs = 10 * 35_000
  const ratio = expectedMs > 0 ? elapsed / expectedMs : 0
  const timeBased = Math.max(status === 'pending' ? 8 : 18, Math.min(95, Math.round(18 + ratio * 77)))
  const backend = typeof job.progress_percent === 'number'
    ? Math.max(0, Math.min(100, Math.round(job.progress_percent)))
    : null
  // Use whichever is higher so the bar always advances (1% per ~4.5s by time)
  // even if the backend reports a stale value.
  return backend !== null ? Math.max(backend, timeBased) : timeBased
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
  const composerRef = useRef<HTMLFormElement | null>(null)
  const [previewMaxHeightPx, setPreviewMaxHeightPx] = useState<number>(() => {
    if (typeof window === 'undefined') return 600
    return Math.max(240, window.innerHeight - 320)
  })
  useEffect(() => {
    const SAFE_GAP = 24
    const TOP_RESERVE = 56
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
  const [userImages, setUserImages] = useState<UserImageItem[]>([])
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>('Start')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null)
  const [previewDismissed, setPreviewDismissed] = useState(false)
  useEffect(() => {
    if (previewVideoId) setPreviewDismissed(false)
  }, [previewVideoId])
  const closePreview = () => {
    setPreviewVideoId(null)
    setPreviewDismissed(true)
  }
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
        }
      }
      return next
    })
  }

  const legacyDeletedKey = userId ? `deleted-videos:${userId}` : null
  const mergedStorageKey = userId ? `merged-videos:${userId}` : null
  const pendingEndAppendsKey = userId ? `pending-end-appends:${userId}` : null
  const pendingStartPrependsKey = userId ? `pending-start-prepends:${userId}` : null
  const [manualOrder, setManualOrder] = useState<string[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [trimmingJobId, setTrimmingJobId] = useState<string | null>(null)
  const [trimSrc, setTrimSrc] = useState<string | null>(null)
  const [editedClips, setEditedClips] = useState<Record<string, { url: string; duration: number }>>({})

  useEffect(() => {
    return () => {
      for (const e of Object.values(editedClips)) {
        try { URL.revokeObjectURL(e.url) } catch { /* noop */ }
      }
    }
  }, [])

  const hasAppliedEdit = (id: string) => Boolean(editedClips[id]?.url)

  const getCardVideoSrc = (id: string, fallback: string | null | undefined): string | undefined => {
    const edited = editedClips[id]?.url
    return edited ?? fallback ?? undefined
  }

  useEffect(() => {
    let cancelled = false
    if (!trimmingJobId) {
      setTrimSrc(null)
      return
    }
    const edited = editedClips[trimmingJobId]?.url
    if (edited) {
      setTrimSrc(edited)
      return
    }
    const job = visibleVideos.find((v) => v.id === trimmingJobId)
    const raw = job?.video?.storage_path
    if (!raw) {
      setTrimSrc(null)
      return
    }
    setTrimSrc(null)
    proxiedVideoUrl(raw)
      .then((u) => { if (!cancelled) setTrimSrc(u) })
      .catch(() => { if (!cancelled) setTrimSrc(raw) })
    return () => { cancelled = true }
  }, [trimmingJobId])

  const applyTrimToCard = (jobId: string) => async (blob: Blob, newDuration: number) => {
    setEditedClips((prev) => {
      const old = prev[jobId]
      if (old) {
        try { URL.revokeObjectURL(old.url) } catch { /* noop */ }
      }
      return { ...prev, [jobId]: { url: URL.createObjectURL(blob), duration: newDuration } }
    })
    setPreviewVideoId(jobId)
    setPreviewDismissed(false)
    setVideoColumnMessage(null)
  }
  const [transitions, setTransitions] = useState<Record<string, TransitionId>>({})
  const [mergedEntries, setMergedEntries] = useState<JobDetail[]>([])
  const [isMerging, setIsMerging] = useState(false)
  const [mergeProgress, setMergeProgress] = useState<number>(0)
  const [musicName, setMusicName] = useState<string | null>(null)
  const [musicUrl, setMusicUrl] = useState<string | null>(null)
  const [musicDuration, setMusicDuration] = useState<number>(0)
  const [musicRange, setMusicRange] = useState<[number, number]>([0, 0])
  const [soundtrackMode, setSoundtrackMode] = useState<'music-only' | 'mix'>('music-only')
  const [clipVolume, setClipVolume] = useState<number>(1)
  const [musicVolume, setMusicVolume] = useState<number>(1)
  const [isMusicDialogOpen, setIsMusicDialogOpen] = useState(false)
  const [isVoiceoverOpen, setIsVoiceoverOpen] = useState(false)
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
    } catch { }
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
    } catch { }
  }

  useEffect(() => {
    if (!legacyDeletedKey) return
    try { window.localStorage.removeItem(legacyDeletedKey) } catch { }
  }, [legacyDeletedKey])

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

  function persistMerged(next: JobDetail[]) {
    if (!mergedStorageKey) return
    try {
      window.localStorage.setItem(mergedStorageKey, JSON.stringify(next))
    } catch { }
  }

  async function deleteCard(jobId: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this video card permanently?')) return
    const isMerged = jobId.startsWith('merged-')
    const mergedEntry = isMerged ? mergedEntries.find((e) => e.id === jobId) : null
    const prevGenerated = generatedVideos
    const prevMerged = mergedEntries
    setGeneratedVideos((current) => current.filter((v) => v.id !== jobId))
    setApprovedIds((current) => {
      if (!current.has(jobId)) return current
      const next = new Set(current)
      next.delete(jobId)
      if (approvedStorageKey) {
        try { window.localStorage.setItem(approvedStorageKey, JSON.stringify(Array.from(next))) } catch { }
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
        const url = mergedEntry?.video?.storage_path
        if (url && userId) {
          const m = url.match(/\/storage\/v1\/object\/(?:public\/)?merged-videos\/(.+)$/)
          if (m) {
            const path = decodeURIComponent(m[1])
            await supabase.storage.from(MERGED_BUCKET).remove([path])
          }
        }
      } else {
        await jobOrchestratorGateway.deleteJob(jobId)
      }
    } catch (err) {
      setGeneratedVideos(prevGenerated)
      if (isMerged) setMergedEntries(prevMerged)
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
      return isTextToVideo ? 'Describe the video you want to generate.' : 'Describe the motion for the frame(s).'
    }
    if (!isTextToVideo && !readyStartFrame && !readyEndFrame) {
      return 'Add a Start or End frame image (use the Start/End buttons on the left).'
    }
    return null
  }, [isSubmitting, hasUploadingFiles, readyStartFrame, readyEndFrame, promptText, isTextToVideo])
  const [composerError, setComposerError] = useState<string | null>(null)
  const [isPromptMenuOpen, setIsPromptMenuOpen] = useState(false)
  const [narratorMode, setNarratorMode] = useState<'idle' | 'input'>('idle')
  const [narratorScript, setNarratorScript] = useState('')

  const runEnhancePrompt = async (options: { mode: 'silent' | 'narrated'; narratorScript?: string }) => {
    if (isEnhancingPrompt || isSubmitting) return
    const current = promptText.trim()
    if (options.mode === 'silent' && !current) {
      setComposerError('Type a short idea first, then choose No narrator.')
      return
    }
    if (options.mode === 'narrated' && !(options.narratorScript ?? '').trim()) {
      setComposerError('Please write the narrator script.')
      return
    }
    setIsEnhancingPrompt(true)
    setComposerError(null)
    try {
      const imageUrls = [readyStartFrame?.url, readyEndFrame?.url].filter((u): u is string => typeof u === 'string' && u.length > 0)
      const { data, error } = await supabase.functions.invoke('enhance-prompt', {
        body: {
          prompt: current,
          imageUrls,
          mode: options.mode,
          narratorScript: options.narratorScript ?? '',
        },
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
      setIsPromptMenuOpen(false)
      setNarratorMode('idle')
      setNarratorScript('')
    } catch {
      setComposerError('Could not enhance prompt. Please try again.')
    } finally {
      setIsEnhancingPrompt(false)
    }
  }

  const startUploadCount = uploadedFiles.filter((file) => file.target === 'Start').length
  const endUploadCount = uploadedFiles.filter((file) => file.target === 'End').length
  const visibleVideos = useMemo(() => {
    return [...mergedEntries, ...generatedVideos]
  }, [generatedVideos, mergedEntries])
  const editedSourceVideos = useMemo(
    () => generatedVideos.filter(
      (v) => normalizeStatus(v.status) === 'completed' && v.video?.storage_path && hasAppliedEdit(v.id)
    ),
    [generatedVideos, editedClips]
  )
  const lockedRatio = useMemo<Ratio | null>(() => {
    if (generatedVideos.length === 0) return null
    const first = generatedVideos[generatedVideos.length - 1]
    return getRatioFor(first)
  }, [generatedVideos])
  useEffect(() => {
    if (lockedRatio && aspectRatio !== lockedRatio) {
      setAspectRatio(lockedRatio)
    }
  }, [lockedRatio, aspectRatio])

  const displayedVideos = useMemo(() => {
    const chronoAsc = [...generatedVideos].sort((l, r) => new Date(l.created_at).getTime() - new Date(r.created_at).getTime())
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
  }, [generatedVideos, manualOrder])

  const handleCardDragStart = (id: string) => (event: React.DragEvent) => {
    setDraggingId(id)
    event.dataTransfer.effectAllowed = 'move'
    try { event.dataTransfer.setData('text/plain', id) } catch {}
  }

  const handleCardDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const visibleUserImages = userImages
  const displayedClips = useMemo<UnifiedClip[]>(() => {
    const items: UnifiedClip[] = [
      ...displayedVideos.map((job) => ({ kind: 'video' as const, id: job.id, createdAt: job.created_at, job })),
      ...visibleUserImages.map((image) => ({ kind: 'image' as const, id: image.id, createdAt: image.created_at, image })),
    ]
    const chronoAsc = items.sort((l, r) => new Date(l.createdAt).getTime() - new Date(r.createdAt).getTime())
    if (!manualOrder) return chronoAsc
    const byId = new Map(chronoAsc.map((c) => [c.id, c]))
    const ordered: UnifiedClip[] = []
    for (const id of manualOrder) {
      const c = byId.get(id)
      if (c) {
        ordered.push(c)
        byId.delete(id)
      }
    }
    for (const c of chronoAsc) {
      if (byId.has(c.id)) ordered.push(c)
    }
    return ordered
  }, [displayedVideos, visibleUserImages, manualOrder])

  const editedDisplayClips = useMemo(
    () => displayedClips.filter((clip) => {
      if (clip.kind !== 'video') return false
      return normalizeStatus(clip.job.status) === 'completed' && Boolean(clip.job.video?.storage_path) && hasAppliedEdit(clip.id)
    }),
    [displayedClips, editedClips]
  )

  const handleCardDrop = (targetId: string) => (event: React.DragEvent) => {
    event.preventDefault()
    const sourceId = draggingId || event.dataTransfer.getData('text/plain')
    setDraggingId(null)
    if (!sourceId || sourceId === targetId) return
    const currentIds = displayedClips.map((c) => c.id)
    const from = currentIds.indexOf(sourceId)
    const to = currentIds.indexOf(targetId)
    if (from === -1 || to === -1) return
    const next = [...currentIds]
    next.splice(from, 1)
    next.splice(to, 0, sourceId)
    setManualOrder(next)
  }

  const handleCardDragEnd = () => setDraggingId(null)

  type PreviewItem =
    | { kind: 'video'; job: JobDetail }
    | { kind: 'image'; image: UserImageItem }

  const previewItem = useMemo<PreviewItem | null>(() => {
    if (previewVideoId) {
      const found = displayedClips.find((c) => c.id === previewVideoId)
      if (found) {
        return found.kind === 'video' ? { kind: 'video', job: found.job } : { kind: 'image', image: found.image }
      }
    }
    if (previewDismissed) return null
    if (visibleVideos.length > 0) {
      const v = visibleVideos.find((video) => video.video?.storage_path) ?? visibleVideos[0]
      return { kind: 'video', job: v }
    }
    const firstImage = displayedClips.find((c) => c.kind === 'image')
    if (firstImage && firstImage.kind === 'image') return { kind: 'image', image: firstImage.image }
    return null
  }, [displayedClips, previewVideoId, previewDismissed, visibleVideos])
  const previewVideo = previewItem?.kind === 'video' ? previewItem.job : null

  async function handleMergeAllVideos() {
    if (!userId) return
    if (editedDisplayClips.length < 2) {
      setVideoColumnMessage('Apply changes to at least 2 cards before creating Final Film.')
      return
    }

    setVideoColumnMessage(null)
    setIsMerging(true)
    setMergeProgress(0)
    try {
      const eligibleClips = editedDisplayClips
      const firstClipRatio = eligibleClips[0]?.kind === 'video' ? getRatioFor(eligibleClips[0].job) : aspectRatio
      const targetSize = firstClipRatio === '9:16' ? { width: 720, height: 1280 } : firstClipRatio === '1:1' ? { width: 1080, height: 1080 } : { width: 1280, height: 720 }
      const urls: string[] = []
      for (const clip of eligibleClips) {
        if (clip.kind !== 'video') continue
        const editedSrc = editedClips[clip.id]?.url
        if (!editedSrc) continue
        urls.push(editedSrc.startsWith('blob:') ? editedSrc : await proxiedVideoUrl(editedSrc))
      }
      if (urls.length < 2) {
        setVideoColumnMessage('Apply changes to at least 2 cards before creating Final Film.')
        return
      }
      const transitionsForMerge: TransitionSpec[] = eligibleClips
        .slice(0, -1)
        .map((clip) => {
          const id = transitions[clip.id] ?? 'cut'
          return { id, durationMs: TRANSITION_DURATION[id] ?? 0 }
        })
      const audioOpt = musicUrl && musicRange[1] > musicRange[0]
        ? {
            src: musicUrl,
            startSec: musicRange[0],
            endSec: musicRange[1],
            musicVolume,
            clipVolume: soundtrackMode === 'music-only' ? 0 : clipVolume,
          }
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
      const firstClipId = eligibleClips[0]?.id
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
      setApprovedIds((current) => {
        const next = new Set(current)
        next.add(mergedId)
        if (approvedStorageKey) {
          try { window.localStorage.setItem(approvedStorageKey, JSON.stringify(Array.from(next))) } catch { }
        }
        return next
      })
      setPreviewVideoId(mergedId)
      const sourceJobsToPurge = generatedVideos.filter((v) => !v.id.startsWith('merged-'))
      const imagesToPurge = userImages
      try {
        const tasks: Promise<unknown>[] = []
        for (const v of sourceJobsToPurge) tasks.push(jobOrchestratorGateway.deleteJob(v.id))
        for (const i of imagesToPurge) tasks.push(generatorUiGateway.deleteUserImage(i.id))
        await Promise.allSettled(tasks)
      } catch (purgeErr) {
        console.error('[merge] purge step failed', purgeErr)
      }
      setGeneratedVideos((current) => current.filter((v) => v.id.startsWith('merged-')))
      setUserImages([])
      setManualOrder(null)
      setPendingEndAppends({})
      setPendingStartPrepends({})
      if (pendingEndAppendsKey) {
        try { window.localStorage.setItem(pendingEndAppendsKey, JSON.stringify({})) } catch { }
      }
      if (pendingStartPrependsKey) {
        try { window.localStorage.setItem(pendingStartPrependsKey, JSON.stringify({})) } catch { }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Merge failed'
      console.error('[merge] failed', err)
      setVideoColumnMessage(`Could not load source video for merge — please try again in a moment. (${msg})`)
    } finally {
      setIsMerging(false)
      setMergeProgress(0)
    }
  }

  return null
}
