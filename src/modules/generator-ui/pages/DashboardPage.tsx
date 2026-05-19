import { Fragment, type ChangeEvent, type FormEvent, type SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BookmarkCheck,
  BookmarkPlus,
  CalendarDays,
  ChevronsRight,
  Check,
  Cpu,
  Clapperboard,
  
  Combine,
  Crop,
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
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
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
import { SequentialClipPlayer } from '@/modules/generator-ui/components/SequentialClipPlayer'
import { VideoWithSoundtrack } from '@/modules/generator-ui/components/VideoWithSoundtrack'
import { PlayableVideo } from '@/modules/generator-ui/components/PlayableVideo'
import type { CreateJobResult, JobDetail, JobSummary } from '@/modules/job-orchestrator/contract'
import { jobOrchestratorGateway } from '@/modules/job-orchestrator/gateway'
import { generatorUiGateway } from '@/modules/generator-ui/gateway'
import { mergeVideoUrls, type TransitionId, type TransitionSpec } from '@/modules/generator-ui/lib/mergeVideos'
import ClipTrimmerDialog from '@/modules/generator-ui/components/ClipTrimmerDialog'
import { VoiceoverDialog } from '@/modules/generator-ui/components/VoiceoverDialog'
import CalendarInfoDialog from '@/modules/generator-ui/components/CalendarInfoDialog'
import ImageReframeDialog from '@/modules/generator-ui/components/ImageReframeDialog'
import AiImageDialog from '@/modules/generator-ui/components/AiImageDialog'
import ScenarioWriterDialog from '@/modules/generator-ui/components/ScenarioWriterDialog'

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


const FRAMES_BUCKET = 'wan-frames'
const MERGED_BUCKET = 'merged-videos'
const USER_IMAGES_BUCKET = 'user-images'

type ModelChoice = {
  id: string
  label: string
  description: string
  providerKey: 'wan' | 'flow'
  model: string
  supports: Array<'t2v' | 'i2v'>
}

const MODEL_CHOICES: ModelChoice[] = [
  {
    id: 'wan-i2v',
    label: 'Wan 2.7 — Image to Video',
    description: 'Animate a Start and/or End frame.',
    providerKey: 'wan',
    model: 'wan2.7-i2v-2026-04-25',
    supports: ['i2v'],
  },
  {
    id: 'wan-t2v',
    label: 'Wan 2.7 — Text to Video',
    description: 'Generate a clip purely from a prompt.',
    providerKey: 'wan',
    model: 'wan2.7-t2v-2026-04-25',
    supports: ['t2v'],
  },
  {
    id: 'flow-v1',
    label: 'Google Veo 3 (Flow)',
    description: '8s clips, 16:9 or 9:16, text or image to video.',
    providerKey: 'flow',
    model: 'flow-video-1',
    supports: ['t2v', 'i2v'],
  },
]


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
  let timeBased = Math.max(status === 'pending' ? 8 : 18, Math.min(95, Math.round(18 + ratio * 77)))
  // Once we've exceeded the expected window, gently "breathe" between 92-95%
  // so the bar doesn't look frozen while the provider is still working.
  if (elapsed > expectedMs) {
    const phase = (elapsed - expectedMs) / 2_000 // ~2s per cycle
    timeBased = 93 + Math.round(Math.sin(phase) + 1) // 92..95
  }
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
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [startContext] = useState('Start')
  const [endGoal] = useState('End')
  const [generatedVideos, setGeneratedVideos] = useState<JobDetail[]>([])
  // Tracks card IDs currently re-submitting a Regenerate. Used to disable the
  // per-card regenerate button while its new Job is being created so the user
  // can't queue duplicates with rapid clicks.
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set())
  // Pending column never shows a "syncing history" state — it always
  // reflects only the in-memory active workspace.
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
  const [userImages, setUserImages] = useState<UserImageItem[]>([])
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null)
  const [isAiImageDialogOpen, setIsAiImageDialogOpen] = useState(false)
  const [isScenarioDialogOpen, setIsScenarioDialogOpen] = useState(false)
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>('Start')
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null)
  const [previewDismissed, setPreviewDismissed] = useState(false)
  // Re-open preview whenever a card is explicitly selected.
  useEffect(() => {
    if (previewVideoId) setPreviewDismissed(false)
  }, [previewVideoId])
  const closePreview = () => {
    setPreviewVideoId(null)
    setPreviewDismissed(true)
  }
  const [isApprovedPanelOpen, setIsApprovedPanelOpen] = useState(false)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [generationMode, setGenerationMode] = useState<'image-to-video' | 'text-to-video'>('image-to-video')
  const [durationSeconds, setDurationSeconds] = useState<5 | 10 | 15 | 45>(5)
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
    // Library must persist across reloads — hydrate approved set from storage.
    if (!approvedStorageKey) { setApprovedIds(new Set()); return }
    try {
      const raw = window.localStorage.getItem(approvedStorageKey)
      const arr = raw ? (JSON.parse(raw) as string[]) : []
      setApprovedIds(new Set(Array.isArray(arr) ? arr : []))
    } catch { setApprovedIds(new Set()) }
  }, [approvedStorageKey])

  function toggleApproved(jobId: string, job?: JobDetail) {
    setApprovedIds((current) => {
      const next = new Set(current)
      const adding = !next.has(jobId)
      if (adding) {
        next.add(jobId)
      } else {
        next.delete(jobId)
      }
      if (approvedStorageKey) {
        try {
          window.localStorage.setItem(approvedStorageKey, JSON.stringify(Array.from(next)))
        } catch {
          /* ignore quota errors */
        }
      }
      // Snapshot durable copy of the job into librarySavedJobs so the Library
      // panel keeps showing it after reloads / Start Over.
      setLibrarySavedJobs((prevMap) => {
        if (adding) {
          if (!job) return prevMap
          // mergedEntries already persists final-film cards, so skip them here.
          if (jobId.startsWith('merged-')) return prevMap
          const nextMap = { ...prevMap, [jobId]: job }
          persistLibrarySavedJobs(nextMap)
          return nextMap
        }
        if (!(jobId in prevMap)) return prevMap
        const { [jobId]: _drop, ...rest } = prevMap
        persistLibrarySavedJobs(rest)
        return rest
      })
      return next
    })
  }

  const legacyDeletedKey = userId ? `deleted-videos:${userId}` : null
  const mergedStorageKey = userId ? `merged-videos:${userId}` : null
  // Persisted snapshot of every approved single-clip JobDetail. The Library
  // panel renders from this map (plus mergedEntries) so saved cards survive
  // page reloads, Start Over, and other workspace resets.
  const librarySavedJobsKey = userId ? `library-saved-jobs:${userId}` : null
  const [librarySavedJobs, setLibrarySavedJobs] = useState<Record<string, JobDetail>>({})

  useEffect(() => {
    if (!librarySavedJobsKey) { setLibrarySavedJobs({}); return }
    try {
      const raw = window.localStorage.getItem(librarySavedJobsKey)
      const obj = raw ? (JSON.parse(raw) as Record<string, JobDetail>) : {}
      setLibrarySavedJobs(obj && typeof obj === 'object' ? obj : {})
    } catch { setLibrarySavedJobs({}) }
  }, [librarySavedJobsKey])

  function persistLibrarySavedJobs(next: Record<string, JobDetail>) {
    if (!librarySavedJobsKey) return
    try {
      window.localStorage.setItem(librarySavedJobsKey, JSON.stringify(next))
    } catch { /* ignore */ }
  }
  const pendingEndAppendsKey = userId ? `pending-end-appends:${userId}` : null
  const pendingStartPrependsKey = userId ? `pending-start-prepends:${userId}` : null
  const [manualOrder, setManualOrder] = useState<string[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [trimmingJobId, setTrimmingJobId] = useState<string | null>(null)
  const [trimSrc, setTrimSrc] = useState<string | null>(null)
  const [editedClips, setEditedClips] = useState<Record<string, { url: string; duration: number }>>({})
  // Set of job ids the user has explicitly applied edits to. Persisted so that
  // Final Film can know which cards to merge after a refresh.
  const [editedJobIds, setEditedJobIds] = useState<Set<string>>(new Set())
  const editedJobIdsKey = userId ? `edited-clips:${userId}` : null

  useEffect(() => {
    // Library-related state must persist across reloads.
    if (!editedJobIdsKey) { setEditedJobIds(new Set()); return }
    try {
      const raw = window.localStorage.getItem(editedJobIdsKey)
      const arr = raw ? (JSON.parse(raw) as string[]) : []
      setEditedJobIds(new Set(Array.isArray(arr) ? arr : []))
    } catch { setEditedJobIds(new Set()) }
  }, [editedJobIdsKey])

  function persistEditedJobIds(next: Set<string>) {
    if (!editedJobIdsKey) return
    try {
      window.localStorage.setItem(editedJobIdsKey, JSON.stringify(Array.from(next)))
    } catch { /* ignore */ }
  }

  // Job ids hidden from the right-side HISTORY panel after Start Over.
  // Persisted per-user so refresh keeps the workspace clean. Library is NOT
  // affected — it reads from `visibleVideos` directly so approved/final-film
  // cards stay visible there.
  const [workspaceHiddenJobIds, setWorkspaceHiddenJobIds] = useState<Set<string>>(new Set())
  const workspaceHiddenJobIdsKey = userId ? `workspace-hidden-jobs:${userId}` : null

  useEffect(() => {
    if (!workspaceHiddenJobIdsKey) { setWorkspaceHiddenJobIds(new Set()); return }
    try {
      const raw = window.localStorage.getItem(workspaceHiddenJobIdsKey)
      const arr = raw ? (JSON.parse(raw) as string[]) : []
      setWorkspaceHiddenJobIds(new Set(Array.isArray(arr) ? arr : []))
    } catch { setWorkspaceHiddenJobIds(new Set()) }
  }, [workspaceHiddenJobIdsKey])

  function persistWorkspaceHiddenJobIds(next: Set<string>) {
    if (!workspaceHiddenJobIdsKey) return
    try {
      window.localStorage.setItem(workspaceHiddenJobIdsKey, JSON.stringify(Array.from(next)))
    } catch { /* ignore */ }
  }

  // Per-project snapshot of the source clips that produced each Final Film
  // (Library item). Lets us re-show the source cards in HISTORY when the user
  // clicks the project card in Library. Persisted per-user across refreshes.
  const [projectSourceJobs, setProjectSourceJobs] = useState<Record<string, JobDetail[]>>({})
  const projectSourceJobsKey = userId ? `project-source-jobs:${userId}` : null

  useEffect(() => {
    if (!projectSourceJobsKey) { setProjectSourceJobs({}); return }
    try {
      const raw = window.localStorage.getItem(projectSourceJobsKey)
      const obj = raw ? (JSON.parse(raw) as Record<string, JobDetail[]>) : {}
      setProjectSourceJobs(obj && typeof obj === 'object' ? obj : {})
    } catch { setProjectSourceJobs({}) }
  }, [projectSourceJobsKey])

  function persistProjectSourceJobs(next: Record<string, JobDetail[]>) {
    if (!projectSourceJobsKey) return
    try {
      window.localStorage.setItem(projectSourceJobsKey, JSON.stringify(next))
    } catch { /* ignore */ }
  }

  // Per-project snapshot of the source images that were merged into each
  // Final Film. Mirrors `projectSourceJobs` so reopening a Library project
  // shows the exact images it was built from — and only those.
  const [projectSourceImages, setProjectSourceImages] = useState<Record<string, UserImageItem[]>>({})
  const projectSourceImagesKey = userId ? `project-source-images:${userId}` : null
  useEffect(() => {
    if (!projectSourceImagesKey) { setProjectSourceImages({}); return }
    try {
      const raw = window.localStorage.getItem(projectSourceImagesKey)
      const obj = raw ? (JSON.parse(raw) as Record<string, UserImageItem[]>) : {}
      setProjectSourceImages(obj && typeof obj === 'object' ? obj : {})
    } catch { setProjectSourceImages({}) }
  }, [projectSourceImagesKey])
  function persistProjectSourceImages(next: Record<string, UserImageItem[]>) {
    if (!projectSourceImagesKey) return
    try {
      window.localStorage.setItem(projectSourceImagesKey, JSON.stringify(next))
    } catch { /* ignore */ }
  }

  // Image ids hidden from the default workspace HISTORY/clip strip after
  // Final Film / Start Over. Parallels `workspaceHiddenJobIds` for images.
  const [workspaceHiddenImageIds, setWorkspaceHiddenImageIds] = useState<Set<string>>(new Set())
  const workspaceHiddenImageIdsKey = userId ? `workspace-hidden-images:${userId}` : null
  useEffect(() => {
    if (!workspaceHiddenImageIdsKey) { setWorkspaceHiddenImageIds(new Set()); return }
    try {
      const raw = window.localStorage.getItem(workspaceHiddenImageIdsKey)
      const arr = raw ? (JSON.parse(raw) as string[]) : []
      setWorkspaceHiddenImageIds(new Set(Array.isArray(arr) ? arr : []))
    } catch { setWorkspaceHiddenImageIds(new Set()) }
  }, [workspaceHiddenImageIdsKey])
  function persistWorkspaceHiddenImageIds(next: Set<string>) {
    if (!workspaceHiddenImageIdsKey) return
    try {
      window.localStorage.setItem(workspaceHiddenImageIdsKey, JSON.stringify(Array.from(next)))
    } catch { /* ignore */ }
  }

  // ---- Active workspace manifest ----
  // The single source of truth for what belongs in the *current* loose
  // workspace. Any job/image NOT in this manifest and NOT claimed by a
  // Library project snapshot is considered orphan and gets permanently
  // deleted server-side on hydrate. This is the rule the user explicitly
  // mandated: nothing is ever stored in the workspace unless it belongs to
  // the active project, and Final Film moves things into Library snapshots.
  const activeJobIdsKey = userId ? `workspace-active-jobs:${userId}` : null
  const activeImageIdsKey = userId ? `workspace-active-images:${userId}` : null
  const [activeJobIds, setActiveJobIds] = useState<Set<string>>(new Set())
  const [activeImageIds, setActiveImageIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!activeJobIdsKey) { setActiveJobIds(new Set()); return }
    try {
      const raw = window.localStorage.getItem(activeJobIdsKey)
      const arr = raw ? (JSON.parse(raw) as string[]) : []
      setActiveJobIds(new Set(Array.isArray(arr) ? arr : []))
    } catch { setActiveJobIds(new Set()) }
  }, [activeJobIdsKey])
  useEffect(() => {
    if (!activeImageIdsKey) { setActiveImageIds(new Set()); return }
    try {
      const raw = window.localStorage.getItem(activeImageIdsKey)
      const arr = raw ? (JSON.parse(raw) as string[]) : []
      setActiveImageIds(new Set(Array.isArray(arr) ? arr : []))
    } catch { setActiveImageIds(new Set()) }
  }, [activeImageIdsKey])
  function persistActiveJobIds(next: Set<string>) {
    if (!activeJobIdsKey) return
    try { window.localStorage.setItem(activeJobIdsKey, JSON.stringify(Array.from(next))) } catch { /* ignore */ }
  }
  function persistActiveImageIds(next: Set<string>) {
    if (!activeImageIdsKey) return
    try { window.localStorage.setItem(activeImageIdsKey, JSON.stringify(Array.from(next))) } catch { /* ignore */ }
  }
  function markActiveJob(id: string) {
    setActiveJobIds((curr) => {
      if (curr.has(id)) return curr
      const next = new Set(curr); next.add(id); persistActiveJobIds(next); return next
    })
  }
  function unmarkActiveJobs(ids: Iterable<string>) {
    setActiveJobIds((curr) => {
      const next = new Set(curr); let changed = false
      for (const id of ids) { if (next.delete(id)) changed = true }
      if (!changed) return curr
      persistActiveJobIds(next); return next
    })
  }
  function markActiveImage(id: string) {
    setActiveImageIds((curr) => {
      if (curr.has(id)) return curr
      const next = new Set(curr); next.add(id); persistActiveImageIds(next); return next
    })
  }
  function unmarkActiveImages(ids: Iterable<string>) {
    setActiveImageIds((curr) => {
      const next = new Set(curr); let changed = false
      for (const id of ids) { if (next.delete(id)) changed = true }
      if (!changed) return curr
      persistActiveImageIds(next); return next
    })
  }

  // When set, HISTORY is filtered to show only the source clips of this
  // Library project. Cleared by Start Over or by the inline "Clear" button.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  // Persist selectedProjectId + preview state per-user across refreshes so
  // a hard reload re-opens the same Final Film the user was viewing.
  const selectedProjectKey = userId ? `selected-project:${userId}` : null
  const previewStateKey = userId ? `preview-state:${userId}` : null
  useEffect(() => {
    if (!selectedProjectKey) return
    try {
      const raw = window.localStorage.getItem(selectedProjectKey)
      if (raw) setSelectedProjectId(raw)
    } catch { /* ignore */ }
  }, [selectedProjectKey])
  useEffect(() => {
    if (!selectedProjectKey) return
    try {
      if (selectedProjectId) window.localStorage.setItem(selectedProjectKey, selectedProjectId)
      else window.localStorage.removeItem(selectedProjectKey)
    } catch { /* ignore */ }
  }, [selectedProjectKey, selectedProjectId])
  useEffect(() => {
    if (!previewStateKey) return
    try {
      const raw = window.localStorage.getItem(previewStateKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as { id?: string | null; dismissed?: boolean }
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.id === 'string') setPreviewVideoId(parsed.id)
        if (typeof parsed.dismissed === 'boolean') setPreviewDismissed(parsed.dismissed)
      }
    } catch { /* ignore */ }
  }, [previewStateKey])
  useEffect(() => {
    if (!previewStateKey) return
    try {
      window.localStorage.setItem(
        previewStateKey,
        JSON.stringify({ id: previewVideoId, dismissed: previewDismissed }),
      )
    } catch { /* ignore */ }
  }, [previewStateKey, previewVideoId, previewDismissed])

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const e of Object.values(editedClips)) {
        try { URL.revokeObjectURL(e.url) } catch { /* noop */ }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getCardVideoSrc = (id: string, fallback: string | null | undefined): string | undefined => {
    const edited = editedClips[id]?.url
    return edited ?? fallback ?? undefined
  }

  // Resolve a CORS-safe URL for the trim dialog whenever it opens.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmingJobId])

  const applyTrimToCard = (jobId: string) => async (
    blob: Blob,
    newDuration: number,
    ext: 'mp4' | 'webm' = 'mp4',
  ) => {
    // 1) Show the trimmed result instantly via a local blob URL.
    const localUrl = URL.createObjectURL(blob)
    setEditedClips((prev) => {
      const old = prev[jobId]
      if (old) {
        try { URL.revokeObjectURL(old.url) } catch { /* noop */ }
      }
      return { ...prev, [jobId]: { url: localUrl, duration: newDuration } }
    })

    // 2) Persist the trimmed file AND make it the card's real asset
    //    server-side so Final Film stitches the edited file, not the original.
    if (!userId) return
    try {
      const contentType = ext === 'webm' ? 'video/webm' : 'video/mp4'
      const path = `${userId}/edited-${jobId}-${Date.now()}.${ext}`
      const up = await supabase.storage
        .from(MERGED_BUCKET)
        .upload(path, blob, { contentType, upsert: false })
      if (up.error) throw new Error(up.error.message)
      const { data } = supabase.storage.from(MERGED_BUCKET).getPublicUrl(path)
      const publicUrl = data.publicUrl

      // Replace the asset row in the backend so the card's storage_path is
      // the edited file. After this, every consumer (Final Film, refresh,
      // etc.) sees the edited video as the card's source of truth.
      const job = generatedVideos.find((j) => j.id === jobId)
      const aspect = job?.video?.aspect_ratio ?? undefined
      const updated = await jobOrchestratorGateway.updateEditedVideo({
        jobId,
        storagePath: publicUrl,
        durationSeconds: Math.round(newDuration),
        aspectRatio: aspect,
      })
      setGeneratedVideos((current) => mergeJob(current, updated))

      // Mark this card as "applied" so Final Film uses it.
      setEditedJobIds((prev) => {
        if (prev.has(jobId)) return prev
        const next = new Set(prev)
        next.add(jobId)
        persistEditedJobIds(next)
        return next
      })
    } catch (err) {
      console.error('[applyTrimToCard] persist failed', err)
      const msg = err instanceof Error ? err.message : 'Apply changes failed'
      setVideoColumnMessage(`Could not apply changes: ${msg}`)
    }
  }
  const [transitions, setTransitions] = useState<Record<string, TransitionId>>({})
  const [mergedEntries, setMergedEntries] = useState<JobDetail[]>([])
  const [isMerging, setIsMerging] = useState(false)
  const [mergeProgress, setMergeProgress] = useState<number>(0)
  // --- Background music for the Final Film ---
  const [musicName, setMusicName] = useState<string | null>(null)
  const [musicUrl, setMusicUrl] = useState<string | null>(null)
  const [musicDuration, setMusicDuration] = useState<number>(0)
  const [musicRange, setMusicRange] = useState<[number, number]>([0, 0])
  const [soundtrackMode, setSoundtrackMode] = useState<'music-only' | 'mix'>('music-only')
  const [clipVolume, setClipVolume] = useState<number>(1)
  const [musicVolume, setMusicVolume] = useState<number>(1)
  const [isMusicDialogOpen, setIsMusicDialogOpen] = useState(false)
  const [isVoiceoverOpen, setIsVoiceoverOpen] = useState(false)
  const [isReframeOpen, setIsReframeOpen] = useState(false)
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null)
  const [voiceoverName, setVoiceoverName] = useState<string | null>(null)
  const [voiceoverVolume, setVoiceoverVolume] = useState<number>(1)
  const [voiceoverClipVolume, setVoiceoverClipVolume] = useState<number>(0.3)
  const musicFileInputRef = useRef<HTMLInputElement | null>(null)
  const musicPreviewAudioRef = useRef<HTMLAudioElement | null>(null)
  const musicWaveformRef = useRef<SoundtrackWaveformHandle | null>(null)
  const uploadVideoInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploadingVideo, setIsUploadingVideo] = useState(false)
  const [pendingEndAppends, setPendingEndAppends] = useState<Record<string, string>>({})
  const [pendingStartPrepends, setPendingStartPrepends] = useState<Record<string, string>>({})
  const processingEndAppendRef = useRef<Set<string>>(new Set())
  const processingStartPrependRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setPendingEndAppends({})
  }, [pendingEndAppendsKey])

  function persistPendingEndAppends(next: Record<string, string>) {
    if (!pendingEndAppendsKey) return
    try {
      window.localStorage.setItem(pendingEndAppendsKey, JSON.stringify(next))
    } catch { /* ignore */ }
  }

  useEffect(() => {
    setPendingStartPrepends({})
  }, [pendingStartPrependsKey])

  function persistPendingStartPrepends(next: Record<string, string>) {
    if (!pendingStartPrependsKey) return
    try {
      window.localStorage.setItem(pendingStartPrependsKey, JSON.stringify(next))
    } catch { /* ignore */ }
  }

  // Legacy local "hide" set is no longer used — deletes are now real and
  // server-authoritative. Purge any leftover key from previous versions.
  useEffect(() => {
    if (!legacyDeletedKey) return
    try { window.localStorage.removeItem(legacyDeletedKey) } catch { /* ignore */ }
  }, [legacyDeletedKey])

  useEffect(() => {
    // Library Final Film entries must persist across reloads.
    if (!mergedStorageKey) { setMergedEntries([]); return }
    try {
      const raw = window.localStorage.getItem(mergedStorageKey)
      const arr = raw ? (JSON.parse(raw) as JobDetail[]) : []
      setMergedEntries(Array.isArray(arr) ? arr : [])
    } catch { setMergedEntries([]) }
  }, [mergedStorageKey])

  function persistMerged(next: JobDetail[]) {
    if (!mergedStorageKey) return
    try {
      window.localStorage.setItem(mergedStorageKey, JSON.stringify(next))
    } catch { /* ignore */ }
  }

  // Prune dangling ids in approvedIds that have no backing entry in either
  // mergedEntries or librarySavedJobs. Keeps the Library badge truthful and
  // prevents ghost cards across releases.
  useEffect(() => {
    if (!approvedStorageKey) return
    if (approvedIds.size === 0) return
    const known = new Set<string>()
    for (const j of mergedEntries) known.add(j.id)
    for (const id of Object.keys(librarySavedJobs)) known.add(id)
    let changed = false
    const next = new Set<string>()
    for (const id of approvedIds) {
      if (known.has(id)) {
        next.add(id)
      } else {
        changed = true
      }
    }
    if (!changed) return
    setApprovedIds(next)
    try {
      window.localStorage.setItem(approvedStorageKey, JSON.stringify(Array.from(next)))
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedStorageKey, mergedEntries, librarySavedJobs])

  async function deleteCard(jobId: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this video card permanently?')) return

    const isMerged = jobId.startsWith('merged-')
    const mergedEntry = isMerged ? mergedEntries.find((e) => e.id === jobId) : null
    const prevGenerated = generatedVideos
    const prevMerged = mergedEntries
    const prevProjectSourceJobs = projectSourceJobs

    // Prune projectSourceJobs snapshots so HISTORY in selected-project mode
    // also drops the deleted clip / project.
    {
      const nextMap: Record<string, JobDetail[]> = {}
      for (const [mid, clips] of Object.entries(projectSourceJobs)) {
        if (isMerged && mid === jobId) continue
        nextMap[mid] = clips.filter((c) => c.id !== jobId)
      }
      setProjectSourceJobs(nextMap)
      persistProjectSourceJobs(nextMap)
    }
    // Same prune for image snapshots: drop the deleted merged project entry.
    if (isMerged) {
      const nextImgMap: Record<string, UserImageItem[]> = {}
      for (const [mid, imgs] of Object.entries(projectSourceImages)) {
        if (mid === jobId) continue
        nextImgMap[mid] = imgs
      }
      if (Object.keys(nextImgMap).length !== Object.keys(projectSourceImages).length) {
        setProjectSourceImages(nextImgMap)
        persistProjectSourceImages(nextImgMap)
      }
    }
    if (isMerged && selectedProjectId === jobId) setSelectedProjectId(null)

    // Optimistic UI removal — remove from in-memory list immediately.
    setGeneratedVideos((current) => current.filter((v) => v.id !== jobId))
    unmarkActiveJobs([jobId])
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
    setEditedJobIds((current) => {
      if (!current.has(jobId)) return current
      const next = new Set(current)
      next.delete(jobId)
      persistEditedJobIds(next)
      return next
    })
    setEditedClips((prev) => {
      if (!prev[jobId]) return prev
      try { URL.revokeObjectURL(prev[jobId].url) } catch { /* noop */ }
      const { [jobId]: _, ...rest } = prev
      return rest
    })
    setLibrarySavedJobs((prev) => {
      if (!(jobId in prev)) return prev
      const { [jobId]: _drop, ...rest } = prev
      persistLibrarySavedJobs(rest)
      return rest
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
        // Real job: backend delete (DB rows + Storage files, server-side).
        await jobOrchestratorGateway.deleteJob(jobId)
      }
    } catch (err) {
      // Roll back the optimistic removal on failure.
      setGeneratedVideos(prevGenerated)
      if (isMerged) setMergedEntries(prevMerged)
      setProjectSourceJobs(prevProjectSourceJobs)
      persistProjectSourceJobs(prevProjectSourceJobs)
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      if (typeof window !== 'undefined') window.alert(`Delete failed: ${msg}`)
    }
  }

  const pollTimerRef = useRef<number | null>(null)
  const pollFailureCountRef = useRef(0)
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
  const [isPromptMenuOpen, setIsPromptMenuOpen] = useState(false)
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'wan-i2v'
    return window.localStorage.getItem('ui:preferred-model') ?? 'wan-i2v'
  })
  const [narratorMode, setNarratorMode] = useState<'idle' | 'input'>('idle')
  const [narratorScript, setNarratorScript] = useState('')

  const selectedModel = useMemo<ModelChoice>(() => {
    const needed: 't2v' | 'i2v' = isTextToVideo ? 't2v' : 'i2v'
    const chosen = MODEL_CHOICES.find((m) => m.id === selectedModelId)
    if (chosen && chosen.supports.includes(needed)) return chosen
    return MODEL_CHOICES.find((m) => m.supports.includes(needed)) ?? MODEL_CHOICES[0]
  }, [selectedModelId, isTextToVideo])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('ui:preferred-model', selectedModelId)
  }, [selectedModelId])


  const runEnhancePrompt = async (
    options: { mode: 'silent' | 'narrated'; narratorScript?: string },
  ) => {
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
      const imageUrls = [readyStartFrame?.url, readyEndFrame?.url].filter(
        (u): u is string => typeof u === 'string' && u.length > 0,
      )
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

  // Library items: union of merged final-film entries and the persisted
  // single-clip snapshots, filtered by the approved set. Independent of
  // workspace lifecycle so reload / Start Over / Regenerate don't shrink it.
  const libraryItems = useMemo<JobDetail[]>(() => {
    const map = new Map<string, JobDetail>()
    for (const j of mergedEntries) map.set(j.id, j)
    for (const j of Object.values(librarySavedJobs)) {
      if (!map.has(j.id)) map.set(j.id, j)
    }
    // Prefer live workspace data when available (fresh status / urls).
    for (const j of generatedVideos) {
      if (map.has(j.id)) map.set(j.id, j)
    }
    return Array.from(map.values())
      .filter((j) => approvedIds.has(j.id))
      .sort((a, b) => {
        const ta = new Date(a.created_at ?? 0).getTime()
        const tb = new Date(b.created_at ?? 0).getTime()
        return tb - ta
      })
  }, [mergedEntries, librarySavedJobs, generatedVideos, approvedIds])

  const completedSourceVideos = useMemo(
    () => generatedVideos.filter(
      (v) => normalizeStatus(v.status) === 'completed' && v.video?.storage_path
    ),
    [generatedVideos]
  )

  // Aspect-ratio chain lock: once the user has any clip in the current chain,
  // every subsequent clip must match the FIRST clip's aspect ratio. The lock
  // releases automatically when the chain is empty (e.g. after Start Over).
  const lockedRatio = useMemo<Ratio | null>(() => {
    if (generatedVideos.length === 0) return null
    // generatedVideos is newest-first; the oldest (first in chain) is last.
    const first = generatedVideos[generatedVideos.length - 1]
    return getRatioFor(first)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedVideos])

  useEffect(() => {
    if (lockedRatio && aspectRatio !== lockedRatio) {
      setAspectRatio(lockedRatio)
    }
  }, [lockedRatio, aspectRatio])

  // Right-panel display order: oldest first (chronological ASC), with manual drag-and-drop overrides.
  const displayedVideos = useMemo(() => {
    // Selected-project mode: HISTORY shows the snapshot of source clips that
    // produced that Final Film, regardless of workspace-hidden state. The
    // snapshot is stored in EXACT film order — preserve it (do NOT re-sort).
    if (selectedProjectId) {
      const snapshot = projectSourceJobs[selectedProjectId] ?? []
      const liveById = new Map(generatedVideos.map((v) => [v.id, v]))
      if (snapshot.length > 0) {
        return snapshot.map((s) => liveById.get(s.id) ?? s)
      }
      // Legacy fallback: this Library project was created before snapshots
      // were tracked. Best-effort: show non-merged completed clips that were
      // created at or before the merged entry, and that are not already
      // claimed by another project's snapshot. Ordered by created_at ASC.
      const mergedEntry = [...mergedEntries, ...generatedVideos].find((v) => v.id === selectedProjectId)
      if (!mergedEntry) return []
      const cutoff = new Date(mergedEntry.created_at).getTime()
      const claimed = new Set<string>()
      for (const [pid, clips] of Object.entries(projectSourceJobs)) {
        if (pid === selectedProjectId) continue
        for (const c of clips) claimed.add(c.id)
      }
      return [...generatedVideos]
        .filter((v) =>
          !v.id.startsWith('merged-') &&
          !claimed.has(v.id) &&
          new Date(v.created_at).getTime() <= cutoff,
        )
        .sort((l, r) => new Date(l.created_at).getTime() - new Date(r.created_at).getTime())
    }
    // Backstop: any clip already snapshotted into a Library project must
    // never appear loose in the default workspace, even if the hidden-set is
    // empty (cleared storage, new device, etc.).
    const claimedByProjects = new Set<string>()
    for (const clips of Object.values(projectSourceJobs)) {
      for (const c of clips) claimedByProjects.add(c.id)
    }
    const chronoAsc = [...generatedVideos]
      .filter((v) => !workspaceHiddenJobIds.has(v.id) && !claimedByProjects.has(v.id))
      .sort(
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
  }, [generatedVideos, manualOrder, workspaceHiddenJobIds, selectedProjectId, projectSourceJobs, mergedEntries])

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


  // Unified clip list (videos + uploaded images), ordered by created_at ASC,
  // with manual drag-and-drop overrides. Both kinds share the same numbering,
  // ordering, drag handlers, and Final Film merge sequence.
  const visibleUserImages = useMemo<UserImageItem[]>(() => {
    if (selectedProjectId) {
      const snapshot = projectSourceImages[selectedProjectId] ?? []
      const liveById = new Map(userImages.map((i) => [i.id, i]))
      return snapshot.map((s) => liveById.get(s.id) ?? s)
    }
    const claimedByProjects = new Set<string>()
    for (const imgs of Object.values(projectSourceImages)) {
      for (const i of imgs) claimedByProjects.add(i.id)
    }
    return userImages.filter((i) => !workspaceHiddenImageIds.has(i.id) && !claimedByProjects.has(i.id))
  }, [userImages, selectedProjectId, projectSourceImages, workspaceHiddenImageIds])

  const displayedClips = useMemo<UnifiedClip[]>(() => {
    const items: UnifiedClip[] = [
      ...displayedVideos.map((job) => ({
        kind: 'video' as const,
        id: job.id,
        createdAt: job.created_at,
        job,
      })),
      ...visibleUserImages.map((image) => ({
        kind: 'image' as const,
        id: image.id,
        createdAt: image.created_at,
        image,
      })),
    ]
    const chronoAsc = items.sort(
      (l, r) => new Date(l.createdAt).getTime() - new Date(r.createdAt).getTime(),
    )
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

  type PreviewItem =
    | { kind: 'video'; job: JobDetail }
    | { kind: 'image'; image: UserImageItem }
    | { kind: 'sequence'; clips: UnifiedClip[] }

  // A clip is "playable" in the live sequential preview if it's a ready video
  // (completed + has a storage_path) or an uploaded image.
  const playableSequenceClips = useMemo<UnifiedClip[]>(() => {
    return displayedClips.filter((c) => {
      if (c.kind === 'image') return true
      const status = normalizeStatus(c.job.status)
      return status === 'completed' && !!c.job.video?.storage_path
    })
  }, [displayedClips])

  const previewItem = useMemo<PreviewItem | null>(() => {
    if (previewVideoId) {
      const found = displayedClips.find((c) => c.id === previewVideoId)
      if (found) {
        return found.kind === 'video'
          ? { kind: 'video', job: found.job }
          : { kind: 'image', image: found.image }
      }
    }
    if (previewDismissed) return null
    // When the user is viewing a Library project, lock the preview to that
    // exact merged project. Never substitute another Library entry.
    if (selectedProjectId) {
      const proj = visibleVideos.find((v) => v.id === selectedProjectId)
      if (proj && proj.video?.storage_path) return { kind: 'video', job: proj }
      // Fall through: if the project's merged asset isn't ready, prefer the
      // sequence of its source clips below — but only those, not the Library.
    }
    // When 2+ playable clips exist in the current workspace, default to the
    // live auto-stitched sequential preview so the user always sees the full
    // project — not just the most-recent clip — without paying to render
    // Final Film.
    if (playableSequenceClips.length >= 2) {
      return { kind: 'sequence', clips: playableSequenceClips }
    }
    // Restrict the single-clip fallback to clips actually present in the
    // current workspace (displayedClips). This prevents the newest Library
    // Final Film from leaking into the preview when the workspace is empty
    // or has only one clip.
    const videoClipsInWorkspace = displayedClips.filter((c) => c.kind === 'video')
    if (videoClipsInWorkspace.length > 0) {
      const playable = videoClipsInWorkspace.find(
        (c) => c.kind === 'video' && c.job.video?.storage_path,
      )
      const pick = (playable ?? videoClipsInWorkspace[0])
      if (pick.kind === 'video') return { kind: 'video', job: pick.job }
    }
    const firstImage = displayedClips.find((c) => c.kind === 'image')
    if (firstImage && firstImage.kind === 'image') return { kind: 'image', image: firstImage.image }
    return null
  }, [displayedClips, previewVideoId, previewDismissed, selectedProjectId, visibleVideos, playableSequenceClips])

  // Backwards-compat alias used by existing card highlight + start-frame code paths
  const previewVideo = previewItem?.kind === 'video' ? previewItem.job : null

  // Live progress tick is handled by the global setProgressTick effect below
  // (re-renders once per second while any job is active), so the preview's
  // time-based pct advances naturally between API polls.

  const emptyStateLabel = useMemo(() => {
    if (isDragging) {
      return 'Drop context into the forge'
    }

    return hasComposerInput ? 'Shape the next version' : 'Start forging a prompt'
  }, [hasComposerInput, isDragging])

  // MANDATORY RULE: the right-side "Pending" column is NOT a history view.
  // It is only a holding area for the cards of the *current* working project
  // (cards the user is editing before Final Film). On mount we therefore:
  //   1) NEVER hydrate jobs/images from the backend into the UI.
  //   2) Permanently delete any backend job/image that is NOT claimed by
  //      the active workspace manifest, so refresh can never resurrect a
  //      previously-pending card. Final Film outputs live only in Library.
  const hydrationRanRef = useRef<string | null>(null)
  useEffect(() => {
    if (!userId) return
    if (!activeJobIdsKey || !activeImageIdsKey) return
    if (hydrationRanRef.current === userId) return
    hydrationRanRef.current = userId
    let cancelled = false
    setVideoColumnMessage(null)

    ;(async () => {
      try {
        const [summaries, imgRowsRes] = await Promise.all([
          jobOrchestratorGateway.listMyJobs().catch(() => [] as JobSummary[]),
          supabase
            .from('generator_user_images')
            .select('id')
            .eq('user_id', userId)
            .is('deleted_at', null),
        ])
        if (cancelled) return

        const orphanJobIds = summaries
          .map((s) => s.id)
          .filter((id) => !activeJobIds.has(id))
        const orphanImageIds = ((imgRowsRes.data ?? []) as { id: string }[])
          .map((r) => r.id)
          .filter((id) => !activeImageIds.has(id))

        // Silent permanent cleanup — never surfaces in the UI.
        await Promise.allSettled([
          ...orphanJobIds.map((id) => jobOrchestratorGateway.deleteJob(id)),
          ...orphanImageIds.map((id) => generatorUiGateway.deleteUserImage(id)),
        ])
      } catch (err) {
        console.error('Pending cleanup failed', err)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeJobIdsKey, activeImageIdsKey])

  const handlePickImage = () => {
    if (isUploadingImage) return
    imageUploadInputRef.current?.click()
  }

  const handleImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !userId) return
    if (!file.type.startsWith('image/')) {
      setVideoColumnMessage('Please choose an image file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setVideoColumnMessage('Image must be smaller than 10 MB.')
      return
    }
    setIsUploadingImage(true)
    setVideoColumnMessage(null)
    resumeSelectedProject()
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
      const path = `${userId}/${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage
        .from(USER_IMAGES_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })
      if (up.error) throw up.error
      const { data: pub } = supabase.storage.from(USER_IMAGES_BUCKET).getPublicUrl(path)
      const publicUrl = pub.publicUrl
      const { data: row, error: insErr } = await supabase
        .from('generator_user_images')
        .insert({
          user_id: userId,
          storage_path: publicUrl,
          size_bytes: file.size,
          mime_type: file.type,
        })
        .select('id, storage_path, created_at, still_duration_seconds, width, height')
        .single()
      if (insErr) throw insErr
      setUserImages((prev) => [row as UserImageItem, ...prev])
      markActiveImage((row as UserImageItem).id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.'
      setVideoColumnMessage(`Image upload failed: ${msg}`)
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handleDeleteUserImage = async (imageId: string) => {
    unmarkActiveImages([imageId])
    if (!userId) return
    const prev = userImages
    setUserImages((curr) => curr.filter((i) => i.id !== imageId))
    // Also drop it from any per-project image snapshot it belonged to.
    {
      const nextMap: Record<string, UserImageItem[]> = {}
      let changed = false
      for (const [mid, imgs] of Object.entries(projectSourceImages)) {
        const filtered = imgs.filter((i) => i.id !== imageId)
        if (filtered.length !== imgs.length) changed = true
        nextMap[mid] = filtered
      }
      if (changed) {
        setProjectSourceImages(nextMap)
        persistProjectSourceImages(nextMap)
      }
    }
    try {
      // Server-side, permanent delete (DB row + storage file).
      await generatorUiGateway.deleteUserImage(imageId)
    } catch (err) {
      setUserImages(prev)
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      setVideoColumnMessage(`Could not delete image: ${msg}`)
    }
  }

  const updateImageDuration = (imageId: string, secondsRaw: number) => {
    const seconds = Math.max(1, Math.min(15, Math.round(secondsRaw) || 1))
    setUserImages((curr) => curr.map((i) => (i.id === imageId ? { ...i, still_duration_seconds: seconds } : i)))
    void supabase
      .from('generator_user_images')
      .update({ still_duration_seconds: seconds })
      .eq('id', imageId)
  }

  // ----- Upload an existing video file as a real History card -----
  // Mirrors the Generated-video pipeline so the resulting card supports
  // every existing feature (trim/Apply, delete, drag, transitions, Final
  // Film, persistence across refresh).
  async function handleUploadVideoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!userId) {
      setVideoColumnMessage('Sign in to upload a video.')
      return
    }
    if (!file.type.startsWith('video/')) {
      setVideoColumnMessage('Please choose a video file (mp4, webm, mov…).')
      return
    }
    const MAX_BYTES = 200 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      setVideoColumnMessage('Video is larger than 200MB. Please choose a smaller file.')
      return
    }

    setIsUploadingVideo(true)
    setVideoColumnMessage(null)
    resumeSelectedProject()

    // Probe duration + intrinsic size from the file in-browser.
    const probe = await new Promise<{ duration: number; width: number; height: number } | null>((resolve) => {
      const url = URL.createObjectURL(file)
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      v.onloadedmetadata = () => {
        const result = {
          duration: Number.isFinite(v.duration) ? v.duration : 0,
          width: v.videoWidth || 0,
          height: v.videoHeight || 0,
        }
        URL.revokeObjectURL(url)
        resolve(result)
      }
      v.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
      v.src = url
    })

    let pickedRatio: '16:9' | '1:1' | '9:16' | undefined
    if (probe && probe.width > 0 && probe.height > 0) {
      const r = probe.width / probe.height
      pickedRatio = r > 1.2 ? '16:9' : r < 0.85 ? '9:16' : '1:1'
    }
    const durationSeconds = probe && probe.duration > 0 ? Math.round(probe.duration) : undefined

    // Upload to the user-videos bucket inside the user's own folder.
    const extGuess = (file.name.split('.').pop() || 'mp4').toLowerCase()
    const ext = /^[a-z0-9]{2,5}$/.test(extGuess) ? extGuess : 'mp4'
    const path = `${userId}/upload-${Date.now()}-${crypto.randomUUID()}.${ext}`
    let uploadedPath: string | null = null
    try {
      const up = await supabase.storage
        .from('user-videos')
        .upload(path, file, { contentType: file.type || 'video/mp4', upsert: false })
      if (up.error) throw new Error(up.error.message)
      uploadedPath = path
      const { data } = supabase.storage.from('user-videos').getPublicUrl(path)
      const publicUrl = data.publicUrl

      // Persist a real job + asset row server-side so the card shows up
      // through the same listMyJobs/getJob pipeline as generated videos.
      const detail = await jobOrchestratorGateway.createUploadedVideoJob({
        storagePath: publicUrl,
        durationSeconds,
        aspectRatio: pickedRatio,
        prompt: file.name,
      })

      // Drop into state immediately so the card appears without a refresh.
      setGeneratedVideos((current) => mergeJob(current, detail))
      markActiveJob(detail.id)
    } catch (err) {
      // Roll back the storage upload if the DB step failed.
      if (uploadedPath) {
        try { await supabase.storage.from('user-videos').remove([uploadedPath]) } catch { /* ignore */ }
      }
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setVideoColumnMessage(`Could not upload video: ${msg}`)
    } finally {
      setIsUploadingVideo(false)
    }
  }

  useEffect(() => {
    const activeJobs = generatedVideos.filter((job) => !isTerminalStatus(job.status))

    if (activeJobs.length === 0) {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
      pollFailureCountRef.current = 0
      return
    }

    // Adaptive backoff: longer-running jobs poll less frequently to reduce load
    // and transient-failure surface. 4s baseline, +2s per 30s elapsed, max 20s.
    const oldestStartMs = Math.min(
      ...activeJobs.map((j) => {
        const t = Date.parse(j.created_at)
        return Number.isFinite(t) ? t : Date.now()
      }),
    )
    const elapsedMs = Math.max(0, Date.now() - oldestStartMs)
    const interval = Math.min(20_000, 4_000 + Math.floor(elapsedMs / 30_000) * 2_000)

    const POLL_ERROR_MSG = 'Could not refresh render status.'
    const FAILURE_THRESHOLD = 3

    pollTimerRef.current = window.setTimeout(async () => {
      // Independent per-job requests: one transient failure must not poison the
      // whole batch. Surface a banner only after several consecutive total-failures.
      const settled = await Promise.allSettled(
        activeJobs.map((job) => jobOrchestratorGateway.getJob(job.id)),
      )
      const fulfilled = settled
        .filter((r): r is PromiseFulfilledResult<JobDetail> => r.status === 'fulfilled')
        .map((r) => r.value)
      const allFailed = fulfilled.length === 0 && settled.length > 0

      if (fulfilled.length > 0) {
        setGeneratedVideos((currentJobs) =>
          fulfilled.reduce((jobs, refreshedJob) => mergeJob(jobs, refreshedJob), currentJobs),
        )
      }

      if (allFailed) {
        pollFailureCountRef.current += 1
        if (pollFailureCountRef.current >= FAILURE_THRESHOLD) {
          const lastErr = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
          const reason = lastErr?.reason
          setVideoColumnMessage(
            reason instanceof ApiError ? `${reason.code}: ${reason.message}` : POLL_ERROR_MSG,
          )
        }
      } else {
        pollFailureCountRef.current = 0
        // Auto-clear stale poll-error banner once we recover.
        setVideoColumnMessage((current) => {
          if (!current) return current
          if (current === POLL_ERROR_MSG || current.endsWith(POLL_ERROR_MSG)) return null
          return current
        })
      }
    }, interval)

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

  function handleReframeAsStart(url: string, ratio: Ratio) {
    setGenerationMode('image-to-video')
    if (!lockedRatio) setAspectRatio(ratio)
    setUploadedFiles((cur) => [
      ...cur,
      {
        id: Date.now(),
        name: `reframed-${ratio.replace(':', 'x')}.png`,
        size: 0,
        target: 'Start',
        type: 'image/png',
        status: 'ready',
        url,
        error: null,
      },
    ])
    setIsReframeOpen(false)
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

  // When the user is viewing a finalized project (selectedProjectId set) and
  // wants to extend it — add a new card or run Final Film again — restore the
  // project's source clips into the live workspace so they appear in HISTORY
  // alongside the new card, then exit project-snapshot mode.
  function resumeSelectedProject() {
    if (!selectedProjectId) return
    const snapshot = projectSourceJobs[selectedProjectId] ?? []
    if (snapshot.length > 0) {
      setGeneratedVideos((current) => snapshot.reduce((acc, j) => mergeJob(acc, j), current))
      setWorkspaceHiddenJobIds((curr) => {
        const next = new Set(curr)
        for (const j of snapshot) next.delete(j.id)
        persistWorkspaceHiddenJobIds(next)
        return next
      })
    }
    setSelectedProjectId(null)
    setPreviewVideoId(null)
    setPreviewDismissed(true)
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
    resumeSelectedProject()

    try {
      const iterations = durationSeconds === 45 ? 3 : 1
      const perClipDuration: 5 | 10 | 15 = durationSeconds === 45 ? 15 : durationSeconds

      // The user's current selection always wins for per-clip generation.
      // (lockedProjectRatio still controls Final Film merge/preview only.)
      const effectiveRatio: Ratio = aspectRatio

      for (let i = 0; i < iterations; i++) {
        let createdJob
        let seedFrames: { firstFrameUrl?: string; lastFrameUrl?: string } = {}
        let pendingEndAppendUrl: string | null = null
        let pendingStartPrependUrl: string | null = null

        if (isTextToVideo) {
          createdJob = await jobOrchestratorGateway.createJob({
            providerKey: selectedModel.providerKey,
            requestedModel: selectedModel.model,
            prompt: nextPrompt,
            durationSeconds: perClipDuration,
            aspectRatio: effectiveRatio,
          })
        } else if (readyStartFrame?.url && readyEndFrame?.url) {
          createdJob = await jobOrchestratorGateway.createJob({
            providerKey: selectedModel.providerKey,
            requestedModel: selectedModel.model,
            prompt: nextPrompt,
            firstFrameUrl: readyStartFrame.url,
            lastFrameUrl: readyEndFrame.url,
            durationSeconds: perClipDuration,
            aspectRatio: effectiveRatio,
          })
          seedFrames = { firstFrameUrl: readyStartFrame.url, lastFrameUrl: readyEndFrame.url }
        } else if (readyStartFrame?.url) {
          createdJob = await jobOrchestratorGateway.createJob({
            providerKey: selectedModel.providerKey,
            requestedModel: selectedModel.model,
            prompt: nextPrompt,
            firstFrameUrl: readyStartFrame.url,
            durationSeconds: perClipDuration,
            aspectRatio: effectiveRatio,
          })
          seedFrames = { firstFrameUrl: readyStartFrame.url }
        } else if (readyEndFrame?.url) {
          createdJob = await jobOrchestratorGateway.createJob({
            providerKey: selectedModel.providerKey,
            requestedModel: selectedModel.model,
            prompt: nextPrompt,
            lastFrameUrl: readyEndFrame.url,
            durationSeconds: perClipDuration,
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
        markActiveJob(seededJob.id)
      }
      setPromptText('')
      setUploadedFiles([])
    } catch (error) {
      let message = 'Could not start video generation.'
      if (error instanceof ApiError) {
        message = `${error.code}: ${error.message}`
      }
      setComposerError(message)
      setVideoColumnMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitScenesAsJobs(scenes: string[]) {
    if (!scenes || scenes.length === 0) return
    if (!isTextToVideo) {
      const msg = 'Scenario writer (45s) currently supports Text-to-Video only.'
      setComposerError(msg)
      setVideoColumnMessage(msg)
      throw new Error(msg)
    }
    if (!selectedModel) {
      const msg = 'Pick a model before sending scenes.'
      setComposerError(msg)
      throw new Error(msg)
    }

    setIsSubmitting(true)
    setComposerError(null)
    setVideoColumnMessage(null)
    resumeSelectedProject()

    const effectiveRatio: Ratio = aspectRatio
    const perClipDuration: 5 | 10 | 15 = 15

    try {
      for (const sceneText of scenes) {
        const prompt = sceneText.trim()
        if (!prompt) continue
        const createdJob = await jobOrchestratorGateway.createJob({
          providerKey: selectedModel.providerKey,
          requestedModel: selectedModel.model,
          prompt,
          durationSeconds: perClipDuration,
          aspectRatio: effectiveRatio,
        })
        const seededJob = buildSeededJob(prompt, createdJob, {})
        rememberClipRatio(seededJob.id, effectiveRatio)
        if (!lockedProjectRatio) {
          setLockedProjectRatio(effectiveRatio)
          persistLockedRatio(effectiveRatio)
        }
        setPreviewVideoId(seededJob.id)
        setGeneratedVideos((currentJobs) => mergeJob(currentJobs, seededJob))
        markActiveJob(seededJob.id)
      }
      setPromptText('')
      setUploadedFiles([])
    } catch (error) {
      let message = 'Could not start scenario generation.'
      if (error instanceof ApiError) {
        message = `${error.code}: ${error.message}`
      } else if (error instanceof Error) {
        message = error.message
      }
      setComposerError(message)
      setVideoColumnMessage(message)
      throw error
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
      (v) => normalizeStatus(v.status) === 'completed' && v.video?.storage_path,
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

  /**
   * Re-run an existing card with the same prompt, model, aspect ratio, and
   * frames. Unlike editAndReuseJob, this does not touch the composer — it
   * creates a brand-new Job immediately and adds it to Pending.
   */
  async function regenerateCard(job: JobDetail) {
    if (regeneratingIds.has(job.id)) return

    const prompt = (job.input_prompt ?? '').trim()
    if (!prompt) {
      setVideoColumnMessage('Cannot regenerate: original prompt is empty.')
      return
    }

    // Resolve provider/model from the card itself, falling back to the
    // currently selected model if the card row doesn't carry one.
    const providerKey = (job.provider_key as 'wan' | 'flow' | null) ?? selectedModel?.providerKey
    const requestedModel = job.model_key ?? selectedModel?.model
    if (!providerKey) {
      setVideoColumnMessage('Cannot regenerate: provider missing on this card.')
      return
    }

    const ratio = getRatioFor(job)
    const firstFrameUrl = job.first_frame_url ?? undefined
    const lastFrameUrl = job.last_frame_url ?? undefined
    // JobSummary doesn't carry requested_duration, so default to a safe 5s
    // single-call render. Long-form (45s) regeneration would need scenario
    // context that isn't bound to a single card.
    const durationSeconds: 5 | 10 | 15 = 5

    setRegeneratingIds((current) => {
      const next = new Set(current)
      next.add(job.id)
      return next
    })
    setComposerError(null)
    setVideoColumnMessage(null)

    try {
      const createdJob = await jobOrchestratorGateway.createJob({
        providerKey,
        requestedModel,
        prompt,
        firstFrameUrl,
        lastFrameUrl,
        durationSeconds,
        aspectRatio: ratio,
      })
      const seededJob = buildSeededJob(prompt, createdJob, {
        firstFrameUrl,
        lastFrameUrl,
      })
      rememberClipRatio(seededJob.id, ratio)
      setPreviewVideoId(seededJob.id)
      setGeneratedVideos((currentJobs) => mergeJob(currentJobs, seededJob))
      markActiveJob(seededJob.id)
    } catch (error) {
      const message = error instanceof ApiError
        ? `${error.code}: ${error.message}`
        : (error instanceof Error ? error.message : 'Could not regenerate this card.')
      setVideoColumnMessage(message)
    } finally {
      setRegeneratingIds((current) => {
        if (!current.has(job.id)) return current
        const next = new Set(current)
        next.delete(job.id)
        return next
      })
    }
  }

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

  function handleVoiceoverAsSoundtrack(url: string, name: string) {
    if (voiceoverUrl) {
      try { URL.revokeObjectURL(voiceoverUrl) } catch { /* ignore */ }
    }
    setVoiceoverUrl(url)
    setVoiceoverName(name)
    setIsVoiceoverOpen(false)
  }

  function handleClearVoiceover() {
    if (voiceoverUrl) {
      try { URL.revokeObjectURL(voiceoverUrl) } catch { /* ignore */ }
    }
    setVoiceoverUrl(null)
    setVoiceoverName(null)
    setVoiceoverVolume(1)
    setVoiceoverClipVolume(0.3)
  }

  function handlePreviewMusicRange() {
    musicWaveformRef.current?.playRange(musicRange[0], musicRange[1])
  }

  async function handleMergeAllVideos() {
    if (isMerging) return
    // Capture snapshot before resume (resume's setState won't reflect synchronously).
    const snapshotForMerge = selectedProjectId ? (projectSourceJobs[selectedProjectId] ?? []) : []
    resumeSelectedProject()

    // Build the merge set from AUTHORITATIVE live data, not from `displayedClips`.
    // `displayedClips` filters out workspaceHiddenJobIds, which are the source
    // clips a previous Final Film already hid from History. Those clips are
    // still valid completed sources — using them lets the user re-finalize
    // (e.g. add music after the fact) without first re-opening a project.
    const videoJobsById = new Map<string, JobDetail>()
    for (const v of completedSourceVideos) videoJobsById.set(v.id, v)
    for (const j of snapshotForMerge) {
      if (
        !videoJobsById.has(j.id) &&
        normalizeStatus(j.status) === 'completed' &&
        j.video?.storage_path
      ) {
        videoJobsById.set(j.id, j)
      }
    }

    const baseClips: UnifiedClip[] = [
      ...Array.from(videoJobsById.values()).map((job) => ({
        kind: 'video' as const,
        id: job.id,
        createdAt: job.created_at,
        job,
      })),
      ...visibleUserImages.map((image) => ({
        kind: 'image' as const,
        id: image.id,
        createdAt: image.created_at,
        image,
      })),
    ]
    // Apply the same ordering rule as displayedClips: manualOrder first,
    // then chronological ASC for anything not in the manual list.
    const chronoAsc = [...baseClips].sort(
      (l, r) => new Date(l.createdAt).getTime() - new Date(r.createdAt).getTime(),
    )
    let eligibleClips: UnifiedClip[] = chronoAsc
    if (manualOrder) {
      const byId = new Map(chronoAsc.map((c) => [c.id, c]))
      const ordered: UnifiedClip[] = []
      for (const id of manualOrder) {
        const c = byId.get(id)
        if (c) {
          ordered.push(c)
          byId.delete(id)
        }
      }
      for (const c of chronoAsc) if (byId.has(c.id)) ordered.push(c)
      eligibleClips = ordered
    }

    if (eligibleClips.length < 1) {
      setVideoColumnMessage('Need at least 1 finished item (video or image) to finalize.')
      return
    }
    if (!userId) {
      setVideoColumnMessage('Sign in to merge videos.')
      return
    }
    // Single-card guard: requires either audio (music/voiceover) or an applied edit,
    // otherwise the "merge" would just re-encode the same clip with no change.
    if (eligibleClips.length === 1) {
      const hasAudio = Boolean(musicUrl && musicRange[1] > musicRange[0]) || Boolean(voiceoverUrl)
      const onlyClip = eligibleClips[0]
      const hasEdit = onlyClip.kind === 'video' && editedJobIds.has(onlyClip.id)
      if (!hasAudio && !hasEdit) {
        setVideoColumnMessage('Add music/voiceover or edit the card before finalizing.')
        return
      }
    }
    setIsMerging(true)
    setMergeProgress(0)
    setVideoColumnMessage(null)
    try {
      // Determine target dimensions from the first video clip (mergeVideos.ts uses
      // the first clip's intrinsic size). If no video, fall back to a 1080p frame.
      const firstVideo = eligibleClips.find((c) => c.kind === 'video') as Extract<UnifiedClip, { kind: 'video' }> | undefined
      let targetSize: { width: number; height: number } | undefined
      if (firstVideo?.job.video?.storage_path) {
        try {
          const probeUrl = await proxiedVideoUrl(firstVideo.job.video.storage_path)
          targetSize = await new Promise((resolve) => {
            const v = document.createElement('video')
            v.crossOrigin = 'anonymous'
            v.muted = true
            v.preload = 'metadata'
            v.onloadedmetadata = () => resolve({ width: v.videoWidth || 1280, height: v.videoHeight || 720 })
            v.onerror = () => resolve({ width: 1280, height: 720 })
            v.src = probeUrl
          })
        } catch { targetSize = { width: 1280, height: 720 } }
      } else {
        const r = aspectRatio
        targetSize = r === '9:16' ? { width: 1080, height: 1920 } : r === '1:1' ? { width: 1080, height: 1080 } : { width: 1920, height: 1080 }
      }

      // Build the merge URL list in display order, converting image clips to
      // short still-frame webm clips uploaded to the merged-videos bucket.
      const urls: string[] = []
      for (const clip of eligibleClips) {
        if (clip.kind === 'video') {
          // After Apply Changes, the card's storage_path IS the edited file
          // (replaced server-side), so we always use it as the source of truth.
          const src = await proxiedVideoUrl(clip.job.video!.storage_path as string)
          urls.push(src)
        } else {
          const seconds = Math.max(1, Math.min(15, clip.image.still_duration_seconds || 3))
          const blob = await imageUrlToClip(clip.image.storage_path, seconds, targetSize)
          const stillPath = `${userId}/still-${clip.image.id}-${Date.now()}.webm`
          const up = await supabase.storage
            .from(MERGED_BUCKET)
            .upload(stillPath, blob, { contentType: 'video/webm', upsert: false })
          if (up.error) throw new Error(up.error.message)
          const { data: pub } = supabase.storage.from(MERGED_BUCKET).getPublicUrl(stillPath)
          urls.push(await proxiedVideoUrl(pub.publicUrl))
        }
      }

      // Build per-gap transition specs (one entry per gap = clips - 1).
      const transitionsForMerge: TransitionSpec[] = eligibleClips
        .slice(0, -1)
        .map((clip) => {
          const id = transitions[clip.id] ?? 'cut'
          return { id, durationMs: TRANSITION_DURATION[id] ?? 0 }
        })

      const hasMusic = Boolean(musicUrl && musicRange[1] > musicRange[0])
      const hasVoiceover = Boolean(voiceoverUrl)
      const mixedClipVolume = hasMusic
        ? (soundtrackMode === 'music-only' ? 0 : clipVolume)
        : (hasVoiceover ? voiceoverClipVolume : 1)
      const audioOpt = hasMusic || hasVoiceover
        ? {
            music: hasMusic
              ? {
                  src: musicUrl as string,
                  startSec: musicRange[0],
                  endSec: musicRange[1],
                  musicVolume,
                }
              : undefined,
            voiceover: hasVoiceover
              ? { src: voiceoverUrl as string, volume: voiceoverVolume }
              : undefined,
            clipVolume: mixedClipVolume,
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
      // The merged mp4 inherits the first source clip's intrinsic dimensions
      // (mergeVideos.ts uses videoWidth/Height of the first clip). Mirror that
      // here so the preview chrome matches what's actually in the file.
      const firstClipId = eligibleClips[0]?.id
      const mergedRatio: Ratio = (firstClipId ? clipAspectRatios[firstClipId] : undefined) ?? aspectRatio
      const entry: JobDetail = {
        id: mergedId,
        status: 'completed',
        input_prompt: urls.length === 1 ? 'Final clip — soundtrack applied' : `Final merged video — ${urls.length} clips`,
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

      // ===== Snapshot source clips for this project =====
      // We keep source jobs on the server so the user can re-open the project
      // from Library and inspect its source clips in HISTORY. We also save a
      // snapshot here as a defensive fallback in case a source job is later
      // removed for any reason.
      // Include both the live workspace jobs AND any snapshot jobs from the
      // project the user is extending (selectedProjectId), so re-running Final
      // Film on a previously finalized project preserves its original clips.
      // Build source-clip snapshot in the EXACT order the clips appear in the
      // Final Film (eligibleClips), so re-opening this Library project later
      // shows HISTORY cards in film order — not by created_at.
      const liveSourceJobsById = new Map(
        generatedVideos.filter((v) => !v.id.startsWith('merged-')).map((v) => [v.id, v]),
      )
      const snapshotJobsById = new Map(
        (selectedProjectId ? (projectSourceJobs[selectedProjectId] ?? []) : []).map((j) => [j.id, j]),
      )
      const sourceJobs: JobDetail[] = []
      for (const clip of eligibleClips) {
        if (clip.kind !== 'video') continue
        const job = liveSourceJobsById.get(clip.id) ?? snapshotJobsById.get(clip.id) ?? clip.job
        sourceJobs.push(job)
      }
      {
        const nextMap = { ...projectSourceJobs, [mergedId]: sourceJobs }
        setProjectSourceJobs(nextMap)
        persistProjectSourceJobs(nextMap)
      }
      // Hide the source jobs from the default HISTORY view so the workspace
      // looks fresh after Final Film, but keep them on the server. Clicking
      // the Library card re-shows them via selectedProjectId.
      {
        const nextHidden = new Set(workspaceHiddenJobIds)
        for (const v of sourceJobs) nextHidden.add(v.id)
        setWorkspaceHiddenJobIds(nextHidden)
        persistWorkspaceHiddenJobIds(nextHidden)
        // Remove from active manifest: they are now claimed by this Library
        // project's source snapshot, not by the loose workspace.
        unmarkActiveJobs(sourceJobs.map((v) => v.id))
      }
      // Same scoping for image cards: snapshot the images that went into the
      // film so reopening the project re-shows only those, and hide them from
      // the fresh workspace.
      {
        const liveImagesById = new Map(userImages.map((i) => [i.id, i]))
        const snapshotImagesById = new Map(
          (selectedProjectId ? (projectSourceImages[selectedProjectId] ?? []) : []).map((i) => [i.id, i]),
        )
        const sourceImages: UserImageItem[] = []
        for (const clip of eligibleClips) {
          if (clip.kind !== 'image') continue
          const img = liveImagesById.get(clip.id) ?? snapshotImagesById.get(clip.id) ?? clip.image
          sourceImages.push(img)
        }
        const nextImgMap = { ...projectSourceImages, [mergedId]: sourceImages }
        setProjectSourceImages(nextImgMap)
        persistProjectSourceImages(nextImgMap)

        const nextHiddenImgs = new Set(workspaceHiddenImageIds)
        for (const i of sourceImages) nextHiddenImgs.add(i.id)
        setWorkspaceHiddenImageIds(nextHiddenImgs)
        persistWorkspaceHiddenImageIds(nextHiddenImgs)
        unmarkActiveImages(sourceImages.map((i) => i.id))
      }
      // Auto Start-Over: reset the working composer/history so the user can
      // immediately begin the next project. Keep the preview open so they
      // still see the freshly merged Final Film.
      resetWorkspace({ keepPreview: true })

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Merge failed'
      console.error('[merge] failed', err)
      setVideoColumnMessage(`Could not load source video for merge — please try again in a moment. (${msg})`)
    } finally {
      setIsMerging(false)
      setMergeProgress(0)
    }
  }

  function resetWorkspace({ keepPreview }: { keepPreview: boolean }) {
    // Library cards (Final Film outputs in mergedEntries + approvedIds) are
    // the user's permanent saved outputs — reset MUST NOT touch them
    // or their files in storage. Only the working composer/history workspace
    // is reset here.
    setTransitions({})
    setManualOrder(null)
    // Reset the "applied edits" workspace marker so Final Film starts fresh.
    // (We do NOT delete the trimmed files in storage — cards are preserved.)
    for (const e of Object.values(editedClips)) {
      try { URL.revokeObjectURL(e.url) } catch { /* noop */ }
    }
    setEditedClips({})
    setEditedJobIds(new Set())
    persistEditedJobIds(new Set())
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
    if (voiceoverUrl) {
      try { URL.revokeObjectURL(voiceoverUrl) } catch { /* ignore */ }
    }
    setVoiceoverUrl(null)
    setVoiceoverName(null)
    setVoiceoverVolume(1)
    setVoiceoverClipVolume(0.3)
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
    if (!keepPreview) {
      setPreviewVideoId(null)
      // Force the empty "Start forging a prompt" state instead of falling back to
      // the most recent visibleVideos entry.
      setPreviewDismissed(true)
    }
    // Hide all current generated jobs from the HISTORY panel so the workspace
    // looks fresh for the next project. We do NOT delete them on the server —
    // Library still reads from visibleVideos and keeps approved/Final Film cards.
    {
      const nextHidden = new Set(workspaceHiddenJobIds)
      for (const j of generatedVideos) nextHidden.add(j.id)
      setWorkspaceHiddenJobIds(nextHidden)
      persistWorkspaceHiddenJobIds(nextHidden)
    }
    // Same for image cards: keep them in their own project snapshots, but
    // remove them from the fresh workspace strip.
    {
      const nextHiddenImgs = new Set(workspaceHiddenImageIds)
      for (const i of userImages) nextHiddenImgs.add(i.id)
      setWorkspaceHiddenImageIds(nextHiddenImgs)
      persistWorkspaceHiddenImageIds(nextHiddenImgs)
    }
    setSelectedProjectId(null)
    // Releasing the project lock so the user can pick a different ratio.
    setLockedProjectRatio(null)
    persistLockedRatio(null)

    // No server-side cleanup: Library files in `merged-videos` are kept.
  }

  async function handleStartOver() {
    // Authoritative loose-set = active manifest minus anything claimed by a
    // Library project snapshot (defensive guard). Cards in any project
    // snapshot stay alive for that project.
    const claimedJobIds = new Set<string>()
    for (const clips of Object.values(projectSourceJobs)) {
      for (const c of clips) claimedJobIds.add(c.id)
    }
    const claimedImageIds = new Set<string>()
    for (const imgs of Object.values(projectSourceImages)) {
      for (const i of imgs) claimedImageIds.add(i.id)
    }
    const looseJobIds = Array.from(activeJobIds).filter((id) => !claimedJobIds.has(id))
    const looseImageIds = Array.from(activeImageIds).filter((id) => !claimedImageIds.has(id))

    resetWorkspace({ keepPreview: false })

    // Clear the active manifest immediately so a refresh during the network
    // round-trip doesn't bring orphans back via the hydrate-protect path.
    setActiveJobIds(new Set()); persistActiveJobIds(new Set())
    setActiveImageIds(new Set()); persistActiveImageIds(new Set())

    if (looseJobIds.length === 0 && looseImageIds.length === 0) return

    const results = await Promise.allSettled([
      ...looseJobIds.map((id) => jobOrchestratorGateway.deleteJob(id)),
      ...looseImageIds.map((id) => generatorUiGateway.deleteUserImage(id)),
    ])
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed > 0) {
      console.error(`Start Over: ${failed} item(s) failed to delete`)
      setVideoColumnMessage(`Could not permanently delete ${failed} item(s). They may reappear after refresh.`)
    }
    // Drop deleted ids from local state immediately.
    setGeneratedVideos((curr) => curr.filter((j) => !looseJobIds.includes(j.id)))
    setUserImages((curr) => curr.filter((i) => !looseImageIds.includes(i.id)))
  }

  // Legacy `pending-fresh-start` flag is no longer honoured — refresh must
  // never auto-reset the workspace. Just clear the flag if it lingers.
  useEffect(() => {
    if (!userId) return
    try { window.localStorage.removeItem(`pending-fresh-start:${userId}`) } catch { /* ignore */ }
  }, [userId])

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
      {(() => {
        if (!trimmingJobId) return null
        const job = visibleVideos.find((v) => v.id === trimmingJobId)
        if (!job?.video?.storage_path) return null
        if (!trimSrc) return null
        return (
          <ClipTrimmerDialog
            open
            onOpenChange={(o) => { if (!o) { setTrimmingJobId(null); setTrimSrc(null) } }}
            videoUrl={trimSrc}
            title={job?.input_prompt ?? undefined}
            onApply={applyTrimToCard(trimmingJobId)}
          />
        )
      })()}
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
          <DropdownMenuItem onSelect={() => { void signOut() }} className="text-red-400 focus:text-red-300">
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        onClick={() => setIsCalendarOpen(true)}
        aria-label="Open calendar"
        className="fixed left-14 top-4 z-50 grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-200/80 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-zinc-100 sm:left-16 sm:top-5"
      >
        <CalendarDays className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      <CalendarInfoDialog
        open={isCalendarOpen}
        onOpenChange={setIsCalendarOpen}
        onApplyPrompt={(p) => {
          setPromptText(p)
          setDurationSeconds(10)
          setIsCalendarOpen(false)
        }}
      />

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
        disabled={isMerging || (Math.max(completedSourceVideos.length, selectedProjectId ? (projectSourceJobs[selectedProjectId]?.length ?? 0) : 0) + visibleUserImages.length) < 1}
        className="flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs uppercase tracking-[0.18em] text-zinc-200/80 transition hover:border-emerald-300/30 hover:bg-emerald-300/[0.06] hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Save cards as a final film"
        title={(() => {
          const totalCards = completedSourceVideos.length + visibleUserImages.length
          if (totalCards < 1) return 'Need at least 1 finished item (video or image)'
          const hasAudio = Boolean(musicUrl) || Boolean(voiceoverUrl)
          if (totalCards === 1) {
            return hasAudio ? 'Apply soundtrack and save to Library' : 'Save this clip as a Final Film'
          }
          return musicUrl
            ? `Final film with music (${formatTimeMS(musicRange[0])} – ${formatTimeMS(musicRange[1])})`
            : 'Save cards as a final film'
        })()}
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

      <button
        type="button"
        onClick={() => setIsVoiceoverOpen(true)}
        className="flex h-9 max-w-[220px] items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs uppercase tracking-[0.18em] text-zinc-200/80 transition hover:border-violet-300/30 hover:bg-violet-300/[0.06] hover:text-violet-100"
        aria-label={voiceoverUrl ? 'Replace voiceover' : 'Generate AI voiceover'}
        title={voiceoverUrl ? 'Replace AI voiceover' : 'Generate an AI voiceover from text (Gemini)'}
      >
        {voiceoverUrl ? (
          <>
            <Mic className="h-[14px] w-[14px]" aria-hidden="true" />
            <span className="truncate normal-case tracking-normal">
              {voiceoverName ?? 'Voiceover'}
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label="Remove voiceover"
              onClick={(ev) => { ev.stopPropagation(); handleClearVoiceover() }}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); handleClearVoiceover() } }}
              className="-mr-1 grid h-5 w-5 cursor-pointer place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </span>
          </>
        ) : (
          <>
            <Mic className="h-[14px] w-[14px]" aria-hidden="true" />
            <span>Voiceover</span>
          </>
        )}
      </button>

      {voiceoverUrl ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-xs text-zinc-200/80 transition hover:border-violet-300/30 hover:bg-violet-300/[0.06] hover:text-violet-100"
              aria-label="Adjust voiceover and clip volume"
              title="Adjust original clip audio and voiceover volume"
            >
              <SlidersHorizontal className="h-[14px] w-[14px]" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-4 border-white/10 bg-zinc-950 text-zinc-100" align="end">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Original clip audio</span>
                <span className="tabular-nums text-zinc-200">{Math.round(voiceoverClipVolume * 100)}%</span>
              </div>
              <Slider
                value={[Math.round(voiceoverClipVolume * 100)]}
                min={0}
                max={100}
                step={1}
                disabled={Boolean(musicUrl && musicRange[1] > musicRange[0])}
                onValueChange={(v) => setVoiceoverClipVolume((v[0] ?? 0) / 100)}
              />
              {musicUrl && musicRange[1] > musicRange[0] ? (
                <p className="text-[10px] leading-relaxed text-zinc-500">
                  Clip audio is controlled from the Soundtrack dialog while music is active.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Voiceover</span>
                <span className="tabular-nums text-zinc-200">{Math.round(voiceoverVolume * 100)}%</span>
              </div>
              <Slider
                value={[Math.round(voiceoverVolume * 100)]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => setVoiceoverVolume((v[0] ?? 0) / 100)}
              />
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
      <VoiceoverDialog
        open={isVoiceoverOpen}
        onOpenChange={setIsVoiceoverOpen}
        onUseAsSoundtrack={handleVoiceoverAsSoundtrack}
      />

      <ImageReframeDialog
        open={isReframeOpen}
        onOpenChange={setIsReframeOpen}
        onUseAsStartFrame={handleReframeAsStart}
      />

      <AiImageDialog
        open={isAiImageDialogOpen}
        onOpenChange={setIsAiImageDialogOpen}
        userId={userId}
        defaultAspect={lockedProjectRatio ?? aspectRatio}
        onSaved={async (row) => {
          setUserImages((prev) => [row as UserImageItem, ...prev])
          markActiveImage((row as UserImageItem).id)
          setGenerationMode('image-to-video')
          setUploadTarget('Start')
          const seedId = Date.now()
          const placeholder: UploadedFile = {
            id: seedId,
            name: `ai-${row.id.slice(0, 6)}.png`,
            size: 0,
            target: 'Start',
            type: 'image/png',
            status: 'uploading',
            url: null,
            error: null,
          }
          setUploadedFiles((cur) => [
            ...cur.filter((f) => f.target !== 'Start' || f.status !== 'ready'),
            placeholder,
          ])
          try {
            if (!userId) throw new Error('Not signed in')
            // Re-stage the AI image into the wan-frames bucket so the jobs-create
            // validator (which only accepts wan-frames/{userId}/...) accepts it.
            const res = await fetch(row.storage_path)
            if (!res.ok) throw new Error(`Could not read AI image (HTTP ${res.status})`)
            const blob = await res.blob()
            const storagePath = `${userId}/start-ai-${Date.now()}-${crypto.randomUUID()}.png`
            const { error: upErr } = await supabase.storage
              .from(FRAMES_BUCKET)
              .upload(storagePath, blob, { contentType: blob.type || 'image/png', upsert: false })
            if (upErr) throw new Error(upErr.message)
            const { data } = supabase.storage.from(FRAMES_BUCKET).getPublicUrl(storagePath)
            setUploadedFiles((current) =>
              current.map((f) =>
                f.id === seedId
                  ? { ...f, status: 'ready', url: data.publicUrl, size: blob.size, error: null }
                  : f,
              ),
            )
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Could not stage image as frame'
            setUploadedFiles((current) =>
              current.map((f) =>
                f.id === seedId ? { ...f, status: 'failed', error: msg } : f,
              ),
            )
          }
        }}
      />

      <ScenarioWriterDialog
        open={isScenarioDialogOpen}
        onOpenChange={setIsScenarioDialogOpen}
        defaultDuration={durationSeconds === 45 ? 45 : (durationSeconds as 5 | 10 | 15)}
        onUseAsPrompt={(text) => setPromptText(text)}
        onSendScenes={submitScenesAsJobs}
      />



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

            {/* Audio mode: music-only vs mix */}
            <div className="space-y-3 rounded-md border border-white/10 bg-black/40 p-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSoundtrackMode('music-only')}
                  aria-pressed={soundtrackMode === 'music-only'}
                  title="Play only the soundtrack — clip audio is muted"
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition ${
                    soundtrackMode === 'music-only'
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                      : 'border-white/10 bg-transparent text-zinc-300 hover:border-white/20 hover:text-zinc-100'
                  }`}
                >
                  <Music2 className="h-4 w-4" aria-hidden="true" />
                  <span>Music only</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSoundtrackMode('mix')}
                  aria-pressed={soundtrackMode === 'mix'}
                  title="Mix clip audio and music — adjust volumes below"
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition ${
                    soundtrackMode === 'mix'
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                      : 'border-white/10 bg-transparent text-zinc-300 hover:border-white/20 hover:text-zinc-100'
                  }`}
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  <span>Mix audio</span>
                </button>
              </div>

              {soundtrackMode === 'mix' ? (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>Clip audio</span>
                      <span className="tabular-nums text-zinc-200">{Math.round(clipVolume * 100)}%</span>
                    </div>
                    <Slider
                      value={[Math.round(clipVolume * 100)]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={(v) => setClipVolume((v[0] ?? 0) / 100)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>Music</span>
                      <span className="tabular-nums text-zinc-200">{Math.round(musicVolume * 100)}%</span>
                    </div>
                    <Slider
                      value={[Math.round(musicVolume * 100)]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={(v) => setMusicVolume((v[0] ?? 0) / 100)}
                    />
                  </div>
                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    Both audio sources are mixed and applied to the Final Film at render time.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Only the music will play on the Final Film. The original clip audio is muted.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={handleClearMusic}>
              Remove
            </Button>
            <Button
              type="button"
              onClick={() => setIsMusicDialogOpen(false)}
            >
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
        {previewItem ? (
          previewItem.kind === 'sequence' ? (
            <SequentialClipPlayer
              clips={previewItem.clips.map((c) => {
                if (c.kind === 'image') {
                  return {
                    kind: 'image' as const,
                    id: c.id,
                    src: c.image.storage_path,
                    ratio: lockedProjectRatio ?? aspectRatio,
                    durationSec: Math.max(1, c.image.still_duration_seconds || 3),
                    label: 'Uploaded image',
                  }
                }
                const src = getCardVideoSrc(c.job.id, c.job.video?.storage_path) ?? c.job.video?.storage_path ?? ''
                return {
                  kind: 'video' as const,
                  id: c.id,
                  src,
                  ratio: getRatioFor(c.job),
                  label: c.job.input_prompt,
                }
              })}
              ratioToCss={ratioToCss}
              ratioToHeight={ratioToHeight}
              ratioToWidth={ratioToWidth}
              maxHeightPx={previewMaxHeightPx}
              onClose={closePreview}
              onActiveClipChange={(id) => { /* highlight handled by HISTORY via previewVideoId on click */ void id }}
              musicUrl={musicUrl}
              musicRange={musicRange}
              musicVolume={musicVolume}
              voiceoverUrl={voiceoverUrl}
              voiceoverVolume={voiceoverVolume}
              clipVolume={
                musicUrl && musicRange[1] > musicRange[0]
                  ? (soundtrackMode === 'music-only' ? 0 : clipVolume)
                  : (voiceoverUrl ? voiceoverClipVolume : 1)
              }
            />
          ) : previewItem.kind === 'image' ? (
            <div className="flex w-full justify-center">
              <div
                className="overflow-hidden rounded-[22px] border border-white/10 bg-[#07080a]/90 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur"
                style={{
                  width: ratioToWidth(aspectRatio),
                  maxWidth: 'calc(100vw - 56rem)',
                  maxHeight: `${previewMaxHeightPx}px`,
                }}
              >
                <div
                  className="relative overflow-hidden bg-black"
                  style={{
                    aspectRatio: ratioToCss(aspectRatio),
                    height: ratioToHeight(aspectRatio),
                    maxWidth: 'calc(100vw - 56rem)',
                  }}
                >
                  <img
                    key={previewItem.image.id}
                    src={previewItem.image.storage_path}
                    alt="Uploaded reference"
                    className="h-full w-full bg-black object-contain"
                  />
                  <button
                    type="button"
                    onClick={closePreview}
                    aria-label="Close preview"
                    title="Close preview"
                    className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/60 text-zinc-200 backdrop-blur transition hover:border-rose-300/40 hover:bg-rose-500/20 hover:text-rose-100"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-h-12 min-w-0 flex-1 overflow-hidden whitespace-normal break-words text-sm font-medium leading-6 text-zinc-200">
                    Uploaded image · {previewItem.image.still_duration_seconds}s in Final Film
                  </p>
                  <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                    Image
                  </span>
                </div>
              </div>
            </div>
          ) : (
          <div className="flex w-full justify-center">
            <div
              className="overflow-hidden rounded-[22px] border border-white/10 bg-[#07080a]/90 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur"
              style={{
                width: ratioToWidth(getRatioFor(previewItem.job)),
                maxWidth: 'calc(100vw - 56rem)',
                maxHeight: `${previewMaxHeightPx}px`,
              }}
            >
              <div
                className="relative overflow-hidden bg-black"
                style={{
                  aspectRatio: ratioToCss(getRatioFor(previewItem.job)),
                  height: ratioToHeight(getRatioFor(previewItem.job)),
                  maxWidth: 'calc(100vw - 56rem)',
                }}
              >
                <button
                  type="button"
                  onClick={closePreview}
                  aria-label="Close preview"
                  title="Close preview"
                  className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/60 text-zinc-200 backdrop-blur transition hover:border-rose-300/40 hover:bg-rose-500/20 hover:text-rose-100"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
                {previewItem.job.video?.storage_path ? (() => {
                  const src = getCardVideoSrc(previewItem.job.id, previewItem.job.video.storage_path) ?? previewItem.job.video.storage_path
                  return (
                    <VideoWithSoundtrack
                      videoKey={`${previewItem.job.id}:${src}`}
                      className="h-full w-full bg-black object-contain"
                      src={src}
                      controls
                      playsInline
                      preload="metadata"
                      clipVolume={
                        musicUrl && musicRange[1] > musicRange[0]
                          ? (soundtrackMode === 'music-only' ? 0 : clipVolume)
                          : (voiceoverUrl ? voiceoverClipVolume : 1)
                      }
                      musicUrl={musicUrl}
                      musicRange={musicRange}
                      musicVolume={musicVolume}
                      voiceoverUrl={voiceoverUrl}
                      voiceoverVolume={voiceoverVolume}
                    />
                  )
                })() : (
                  <div className="grid h-full place-items-center px-6 text-center">
                    {(() => {
                      const status = normalizeStatus(previewItem.job.status)
                      const isRendering = status === 'processing' || status === 'pending'
                      const pct = isRendering ? getJobProgressPercent(previewItem.job) ?? 0 : 0
                      const startedAt = Date.parse(previewItem.job.created_at)
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
                          <p className="mt-4 text-sm font-semibold text-zinc-300">{formatStatusLabel(previewItem.job.status)}</p>
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
                  {previewItem.job.input_prompt}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  {previewItem.job.video?.storage_path ? (
                    <button
                      type="button"
                      onClick={() => setTrimmingJobId(previewItem.job.id)}
                      aria-label="Trim clip"
                      title="Trim clip"
                      className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-200"
                    >
                      <Scissors className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                  <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${getStatusDotClassName(previewItem.job.status)}`} />
                    {formatStatusLabel(previewItem.job.status)}
                    {(() => {
                      const status = normalizeStatus(previewItem.job.status)
                      if (status !== 'processing' && status !== 'pending') return null
                      const pct = getJobProgressPercent(previewItem.job)
                      return pct !== null ? <span className="tabular-nums text-amber-300">{pct}%</span> : null
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </div>
          )
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
        aria-label="Pending"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="inline-flex items-center gap-2">
            <History className="h-4 w-4 text-amber-300" aria-hidden="true" />
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Pending</p>
            <span className="grid h-6 min-w-6 place-items-center rounded-full border border-white/10 px-2 text-xs font-semibold text-zinc-300">
              {displayedClips.length}
            </span>
          </div>
        </div>

        {selectedProjectId ? (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.05] px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-200/70">Showing project</p>
              <p className="truncate text-xs font-medium text-zinc-100">
                {visibleVideos.find((v) => v.id === selectedProjectId)?.input_prompt ?? 'Project'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedProjectId(null)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-300 transition hover:border-white/30 hover:bg-white/[0.08]"
              aria-label="Clear project filter"
              title="Clear project filter"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-500">Working clips</p>
            <h2 className="text-sm font-semibold text-zinc-100">Pending</h2>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={imageUploadInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelected}
            />
            <button
              type="button"
              onClick={handlePickImage}
              disabled={isUploadingImage}
              className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-[#141518]/95 text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Upload image"
              title="Upload image"
            >
              {isUploadingImage ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <input
              ref={uploadVideoInputRef}
              id="upload-film-input"
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={handleUploadVideoFile}
              disabled={isUploadingVideo}
            />
            <label
              htmlFor="upload-film-input"
              role="button"
              aria-label="Upload film"
              aria-disabled={isUploadingVideo}
              title="Upload film"
              className={`grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-white/10 bg-[#141518]/95 text-zinc-300 transition hover:border-sky-300/30 hover:bg-sky-300/[0.08] hover:text-sky-100 ${isUploadingVideo ? 'pointer-events-none opacity-60' : ''}`}
            >
              {isUploadingVideo ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-4 w-4" aria-hidden="true" />
              )}
            </label>
            <button
              type="button"
              onClick={() => {
                if (playableSequenceClips.length === 0) {
                  setVideoColumnMessage('No ready clips to live-preview yet.')
                  return
                }
                setVideoColumnMessage(null)
                setPreviewVideoId(null)
                setPreviewDismissed(false)
              }}
              className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-[#141518]/95 text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-100"
              aria-label="Live preview all cards"
              title="Live preview all cards"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {videoColumnMessage ? (
          <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-100">
            {videoColumnMessage}
          </div>
        ) : null}

        <div className="mt-3 flex-1 overflow-y-auto overflow-x-hidden pr-1">
          {displayedClips.length > 0 ? (
            <div className="grid min-w-0 gap-3">
              {displayedClips.map((clip, index) => {
                const isLast = index === displayedClips.length - 1
                const isDragging = draggingId === clip.id

                if (clip.kind === 'image') {
                  const img = clip.image
                  const isPreviewSelected = previewVideoId === clip.id
                  const transitionId: TransitionId = transitions[clip.id] ?? 'cut'
                  return (
                    <Fragment key={`img-${img.id}`}>
                      <article
                        draggable
                        onDragStart={handleCardDragStart(clip.id)}
                        onDragOver={handleCardDragOver}
                        onDrop={handleCardDrop(clip.id)}
                        onDragEnd={handleCardDragEnd}
                        className={`w-full min-w-0 cursor-pointer rounded-2xl border p-3 transition hover:border-white/20 hover:bg-white/[0.055] ${
                          isPreviewSelected ? 'border-white/20 bg-white/[0.06]' : 'border-white/10 bg-white/[0.035]'
                        } ${isDragging ? 'opacity-50' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label="Preview uploaded image"
                        onClick={() => setPreviewVideoId(clip.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setPreviewVideoId(clip.id)
                          }
                        }}
                      >
                        <div
                          className="relative w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#15171a]"
                          style={{ aspectRatio: '1 / 1' }}
                        >
                          <img
                            src={img.storage_path}
                            alt="Uploaded reference"
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                          <span
                            className="pointer-events-none absolute left-2 top-2 grid h-6 min-w-6 place-items-center rounded-full bg-black/70 px-1.5 text-xs font-semibold tabular-nums text-white shadow-md ring-1 ring-white/15"
                            aria-label={`Card ${index + 1}`}
                          >
                            {index + 1}
                          </span>
                        </div>
                        <div className="mt-3 flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">
                            Uploaded image
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
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleDeleteUserImage(img.id)
                              }}
                              aria-label="Delete image"
                              title="Delete image"
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:border-rose-300/40 hover:bg-rose-300/10 hover:text-rose-200"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <div
                          className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-2">
                            <span>Duration</span>
                            <div
                              role="radiogroup"
                              aria-label="Image duration in Final Film"
                              className="inline-flex rounded-full border border-white/10 bg-black/20 p-0.5 text-[11px] font-semibold"
                            >
                              {([5, 10, 15] as const).map((sec) => {
                                const active = (img.still_duration_seconds || 3) === sec
                                return (
                                  <button
                                    key={sec}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => updateImageDuration(img.id, sec)}
                                    className={`rounded-full px-2.5 py-1 transition ${active ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}
                                  >
                                    {sec}s
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <span>{formatCreatedAt(img.created_at)}</span>
                        </div>
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
                                    setTransitions((current) => ({ ...current, [clip.id]: opt.id }))
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
                }

                const video = clip.job
                const status = normalizeStatus(video.status)
                const isPreviewSelected = previewVideo?.id === video.id
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
                        <PlayableVideo
                          className="h-full w-full max-w-full bg-black object-contain"
                          src={getCardVideoSrc(video.id, video.video.storage_path)}
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
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
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
                                  toggleApproved(video.id, video)
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
                        {(video.video?.storage_path || editedClips[video.id]?.url) ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setTrimmingJobId(video.id)
                            }}
                            aria-label="Trim clip"
                            title="Trim clip"
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-200"
                          >
                            <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        ) : null}
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
              {libraryItems.length}
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
            const approvedVideos = libraryItems
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
                        // Show this project's source clips in HISTORY.
                        setSelectedProjectId(video.id.startsWith('merged-') ? video.id : null)
                        setPreviewDismissed(false)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setPreviewVideoId(video.id)
                          setIsApprovedPanelOpen(false)
                          setSelectedProjectId(video.id.startsWith('merged-') ? video.id : null)
                          setPreviewDismissed(false)
                        }
                      }}
                    >
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#15171a]">
                        {video.video?.storage_path ? (
                          <PlayableVideo
                            className="h-full w-full bg-black object-cover"
                            src={getCardVideoSrc(video.id, video.video.storage_path)}
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
                              <button
                                type="button"
                                onClick={async (event) => {
                                  event.stopPropagation()
                                  const url = video.video!.storage_path
                                  const filename = `final-film-${video.id.slice(0, 8)}.mp4`
                                  try {
                                    const response = await fetch(url)
                                    if (!response.ok) throw new Error('Download failed')
                                    const blob = await response.blob()
                                    const blobUrl = URL.createObjectURL(blob)
                                    const a = document.createElement('a')
                                    a.href = blobUrl
                                    a.download = filename
                                    document.body.appendChild(a)
                                    a.click()
                                    document.body.removeChild(a)
                                    URL.revokeObjectURL(blobUrl)
                                  } catch (err) {
                                    console.error('Final film download failed', err)
                                    window.open(url, '_blank')
                                  }
                                }}
                                aria-label="Download video"
                                title="Download video"
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200"
                              >
                                <Download className="h-3 w-3" aria-hidden="true" />
                              </button>
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
            {([5, 10, 15, 45] as const).map((sec) => {
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
              const isLocked = lockedRatio !== null && opt.value !== lockedRatio
              const isLockedActive = lockedRatio !== null && opt.value === lockedRatio
              const lockTitle = isLocked
                ? `Locked — this chain is ${lockedRatio}. Start Over to change aspect ratio.`
                : isLockedActive
                  ? `Locked to match the first clip in this chain (${lockedRatio}). Start Over to change.`
                  : `${opt.label} — ${opt.hint}`
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-disabled={isLocked}
                  disabled={isLocked}
                  onClick={() => { if (!isLocked) setAspectRatio(opt.value) }}
                  title={lockTitle}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                    active
                      ? 'bg-zinc-100 text-zinc-950'
                      : 'text-zinc-400 hover:text-zinc-200'
                  } ${isLocked ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                >
                  <span>{opt.label}</span>
                  <span className={`text-[10px] uppercase tracking-wide ${active ? 'text-zinc-500' : 'text-zinc-500'}`}>{opt.hint}</span>
                  {(isLocked || isLockedActive) ? (
                    <Lock className="h-3 w-3 opacity-70" aria-hidden="true" />
                  ) : null}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setIsReframeOpen(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/20 text-zinc-300 transition hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-100"
            aria-label="Reframe an image to a target aspect ratio"
            title="Reframe an image (9:16 / 1:1 / 16:9) with Nano Banana"
          >
            <Crop className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setIsAiImageDialogOpen(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/20 text-zinc-300 transition hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-100"
            aria-label="Generate image with AI"
            title="Generate image with AI (Nano Banana)"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setIsScenarioDialogOpen(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/20 text-zinc-300 transition hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-100"
            aria-label="Write a scenario from your idea"
            title="Write a scenario from your idea"
          >
            <Clapperboard className="h-4 w-4" aria-hidden="true" />
          </button>
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
                {uploadedFiles.map((file) => {
                  const canPreview = file.status === 'ready' && Boolean(file.url)
                  return (
                    <span
                      key={file.id}
                      className="relative inline-block"
                      title={file.status === 'failed' ? file.error ?? undefined : file.name}
                    >
                      <button
                        type="button"
                        onClick={() => { if (canPreview && file.url) setPreviewImageUrl(file.url) }}
                        disabled={!canPreview}
                        aria-label={canPreview ? `Preview ${file.name}` : file.name}
                        className={`grid h-12 w-12 place-items-center overflow-hidden rounded-md border bg-white/[0.04] ${
                          file.status === 'failed' ? 'border-rose-400/40' : 'border-white/10'
                        } ${canPreview ? 'cursor-zoom-in hover:border-white/30' : 'cursor-default'}`}
                      >
                        {file.status === 'ready' && file.url ? (
                          <img src={file.url} alt="" className="h-full w-full object-cover" />
                        ) : file.status === 'uploading' ? (
                          <LoaderCircle className="h-4 w-4 animate-spin text-zinc-400" aria-hidden="true" />
                        ) : (
                          <Paperclip className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-white/15 bg-black/80 text-zinc-300 shadow transition hover:text-zinc-100"
                        aria-label={`Remove ${file.name}`}
                        onClick={() => removeUploadedFile(file.id)}
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </span>
                  )
                })}
              </div>
            ) : null}

            {composerError ? (
              <p className="text-xs leading-5 text-rose-300">{composerError}</p>
            ) : blockedReason && hasComposerInput ? (
              <p className="text-xs leading-5 text-zinc-500">{blockedReason}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <Popover open={isModelMenuOpen} onOpenChange={setIsModelMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Choose video model"
                  title={`Model: ${selectedModel.label}`}
                  className="inline-flex h-10 max-w-[14rem] items-center justify-center gap-2 truncate rounded-full border border-[#2a2d32] bg-black/20 px-3 text-xs font-semibold text-zinc-200/80 transition hover:border-amber-300/60 hover:bg-white/[0.05] hover:text-amber-200"
                >
                  <Cpu className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{selectedModel.label}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                className="w-72 border-white/10 bg-[#0b0c0e]/95 p-2 text-zinc-200 shadow-[0_22px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl"
              >
                {MODEL_CHOICES.map((choice) => {
                  const needed: 't2v' | 'i2v' = isTextToVideo ? 't2v' : 'i2v'
                  const compatible = choice.supports.includes(needed)
                  const isActive = choice.id === selectedModel.id
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      disabled={!compatible}
                      onClick={() => {
                        setSelectedModelId(choice.id)
                        setIsModelMenuOpen(false)
                      }}
                      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40 ${isActive ? 'bg-white/[0.05]' : ''}`}
                    >
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-300">
                        {isActive ? <Check className="h-4 w-4" aria-hidden="true" /> : <Cpu className="h-4 w-4" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-zinc-100">{choice.label}</span>
                        <span className="block text-xs leading-5 text-zinc-500">
                          {compatible ? choice.description : `Not available in ${isTextToVideo ? 'Text to Video' : 'Image to Video'} mode.`}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </PopoverContent>
            </Popover>

            <Popover
              open={isPromptMenuOpen}
              onOpenChange={(open) => {
                setIsPromptMenuOpen(open)
                if (!open) {
                  setNarratorMode('idle')
                  setNarratorScript('')
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={isEnhancingPrompt || isSubmitting}
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
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                className="w-80 border-white/10 bg-[#0b0c0e]/95 p-2 text-zinc-200 shadow-[0_22px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl"
              >
                <button
                  type="button"
                  onClick={() => runEnhancePrompt({ mode: 'silent' })}
                  disabled={isEnhancingPrompt || promptText.trim().length === 0}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-300">
                    <MicOff className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-zinc-100">No narrator</span>
                    <span className="block text-xs leading-5 text-zinc-500">
                      Enhance the prompt so the video has no voice-over, dialogue, or talking.
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setNarratorMode('input')}
                  disabled={isEnhancingPrompt}
                  className={`mt-1 flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40 ${
                    narratorMode === 'input' ? 'bg-white/[0.04]' : ''
                  }`}
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-amber-300/30 bg-amber-300/10 text-amber-200">
                    <Mic className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-zinc-100">With narrator</span>
                    <span className="block text-xs leading-5 text-zinc-500">
                      Provide the script — the prompt will be built around the narrator's words.
                    </span>
                  </span>
                </button>

                {narratorMode === 'input' ? (
                  <div className="mt-2 space-y-2 border-t border-white/10 px-1 pt-3">
                    <label htmlFor="narrator-script" className="block text-xs font-medium text-zinc-400">
                      Narrator script
                    </label>
                    <textarea
                      id="narrator-script"
                      value={narratorScript}
                      onChange={(e) => setNarratorScript(e.target.value)}
                      rows={4}
                      maxLength={1500}
                      placeholder="Type the exact words the narrator should say…"
                      className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm leading-5 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-300/40"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-zinc-600">{narratorScript.length}/1500</span>
                      <button
                        type="button"
                        onClick={() => runEnhancePrompt({ mode: 'narrated', narratorScript })}
                        disabled={isEnhancingPrompt || narratorScript.trim().length === 0}
                        className="inline-flex h-8 items-center gap-2 rounded-full bg-amber-300 px-3 text-xs font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isEnhancingPrompt ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Apply
                      </button>
                    </div>
                  </div>
                ) : null}
              </PopoverContent>
            </Popover>

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

      <Dialog open={!!previewImageUrl} onOpenChange={(o) => { if (!o) setPreviewImageUrl(null) }}>
        <DialogContent className="max-w-3xl border-white/10 bg-black/90 p-3">
          <DialogHeader className="sr-only">
            <DialogTitle>Image preview</DialogTitle>
          </DialogHeader>
          {previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt="Attachment preview"
              className="mx-auto max-h-[80vh] w-auto object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
