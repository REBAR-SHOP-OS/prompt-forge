import { Fragment, type ChangeEvent, type FormEvent, type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BookmarkCheck,
  BookmarkPlus,
  CalendarDays,
  ChevronsRight,
  Check,
  ChevronDown,
  Cpu,
  Camera,
  ListChecks,
  Clapperboard,
  Package,
  Heart,

   
  
  Combine,
  Crop,
  Database,
  Download,
  FileUp,
  Film,
  GripVertical,
  Hammer,
  History,
  Image as ImageIcon,
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
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Wand2,
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
import { Checkbox } from '@/components/ui/checkbox'
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
import { videoLibraryGateway } from '@/modules/video-library/gateway'
import type { VideoSummary } from '@/modules/video-library/contract'
import { generatorUiGateway } from '@/modules/generator-ui/gateway'
import { mergeVideoUrls, MergeCancelledError, type TransitionId, type TransitionSpec } from '@/modules/generator-ui/lib/mergeVideos'
import { ensureMp4 } from '@/modules/generator-ui/lib/transcodeToMp4'
import ClipTrimmerDialog from '@/modules/generator-ui/components/ClipTrimmerDialog'
import UsageStatsPopover from '@/modules/generator-ui/components/UsageStatsPopover'
import VideoToVideoDialog from '@/modules/generator-ui/components/VideoToVideoDialog'
import { VoiceoverDialog } from '@/modules/generator-ui/components/VoiceoverDialog'
import CalendarInfoDialog from '@/modules/generator-ui/components/CalendarInfoDialog'

import ImageReframeDialog from '@/modules/generator-ui/components/ImageReframeDialog'
import AiImageDialog from '@/modules/generator-ui/components/AiImageDialog'
import ScenarioWriterDialog from '@/modules/generator-ui/components/ScenarioWriterDialog'
import ProductAdDialog from '@/modules/generator-ui/components/ProductAdDialog'

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
import { getMajorOccasionForDate } from '@/modules/generator-ui/lib/majorOccasions'
import { StylePreviewCard } from '@/modules/generator-ui/components/StylePreviewCard'
import {
  CAMERA_STYLES,
  GENRE_STYLES,
  SCENE_STYLES,
  TEMPLATE_STYLES,
  SCENE_GROUP_ORDER,
  TEMPLATE_GROUP_ORDER,
  buildStyleHints,
  countSelectedStyles,
  emptyStyleSelection,
  type StyleItem,
  type StyleSelection,
} from '@/modules/generator-ui/lib/promptStyles'

function StyleSection({
  title,
  items,
  selectedIds,
  onToggle,
}: {
  title: string
  items: StyleItem[]
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const active = selectedIds.includes(item.id)
          const chip = (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
                active
                  ? 'border-amber-300 bg-amber-300/15 text-amber-100'
                  : 'border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/25 hover:bg-white/[0.06]'
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
          return (
            <StylePreviewCard
              key={item.id}
              title={item.label}
              description={item.prompt}
              preview={item.preview}
            >
              {chip}
            </StylePreviewCard>
          )
        })}
      </div>
    </div>
  )
}



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
  category?: string | null
  title?: string | null
  /** Durable per-project group id; mirrors job draft_group_id. */
  draft_group_id?: string | null
}

type UnifiedClip =
  | { kind: 'video'; id: string; createdAt: string; job: JobDetail }
  | { kind: 'image'; id: string; createdAt: string; image: UserImageItem }

type UserAudioItem = {
  id: string
  storage_path: string
  kind: 'music' | 'voiceover'
  name: string | null
  duration_seconds: number | null
  created_at: string
  /** Signed URL for playback/download (private bucket). */
  url?: string | null
}


const FRAMES_BUCKET = 'wan-frames'
const MERGED_BUCKET = 'merged-videos'
const USER_IMAGES_BUCKET = 'user-images'
const USER_AUDIO_BUCKET = 'user-audio'

type ModelChoice = {
  id: string
  label: string
  description: string
  providerKey: 'wan' | 'flow' | 'local'
  model: string
  supports: Array<'t2v' | 'i2v'>
}

const MODEL_CHOICES: ModelChoice[] = [
  {
    id: 'flow-v1',
    label: 'Google Veo 3 Fast',
    description: 'Default. ~$0.10/s, good quality, fast generation. Recommended.',
    providerKey: 'flow',
    model: 'flow-video-1',
    supports: ['t2v', 'i2v'],
  },
  {
    id: 'flow-v1-pro',
    label: 'Google Veo 3.1 Pro',
    description: 'Highest quality Veo 3.1. ~$0.40/s — 4× more expensive than Fast.',
    providerKey: 'flow',
    model: 'flow-video-1-pro',
    supports: ['t2v', 'i2v'],
  },
  {
    id: 'wan-i2v',
    label: 'Wan 2.7 — Image to Video',
    description: 'Animate a Start and/or End frame. ~$0.15 / clip.',
    providerKey: 'wan',
    model: 'wan2.7-i2v-2026-04-25',
    supports: ['i2v'],
  },
  {
    id: 'wan-t2v',
    label: 'Wan 2.7 — Text to Video',
    description: 'Generate a clip purely from a prompt. ~$0.15 / clip.',
    providerKey: 'wan',
    model: 'wan2.7-t2v-2026-04-25',
    supports: ['t2v'],
  },
  {
    id: 'local-wan21-i2v',
    label: 'Local Wan 2.1 — Image to Video',
    description: 'Runs on your local RTX router. Free (no cloud cost). Requires the local video router to be configured.',
    providerKey: 'local',
    model: 'local/wan-2.1-i2v',
    supports: ['i2v'],
  },
  {
    id: 'local-wan21-t2v',
    label: 'Local Wan 2.1 — Text to Video',
    description: 'Runs on your local RTX router. Free (no cloud cost). Requires the local video router to be configured.',
    providerKey: 'local',
    model: 'local/wan-2.1-t2v',
    supports: ['t2v'],
  },
  {
    id: 'local-ltx-i2v',
    label: 'Local LTX Video — Image to Video',
    description: 'Runs on your local RTX router. Free (no cloud cost). Requires the local video router to be configured.',
    providerKey: 'local',
    model: 'local/ltx-video-i2v',
    supports: ['i2v'],
  },
  {
    id: 'local-ltx-t2v',
    label: 'Local LTX Video — Text to Video',
    description: 'Runs on your local RTX router. Free (no cloud cost). Requires the local video router to be configured.',
    providerKey: 'local',
    model: 'local/ltx-video-t2v',
    supports: ['t2v'],
  },
]


// Mirrors backend pricing in supabase/functions/_shared/modules/external-api-adapter/service.ts.
// 1 USD = 100 credits. Keep in sync with COST_MAP_USD.
function estimateGenerationCost(model: ModelChoice, totalDurationSec: number): {
  usd: number
  credits: number
  clips: number
  perClipSec: number
  perClipUsd: number
} {
  const clips = totalDurationSec === 135 ? 9 : totalDurationSec === 45 ? 3 : totalDurationSec === 30 ? 2 : 1
  const perClipSec = clips > 1 ? 15 : totalDurationSec
  // Mirror backend computeUsd exactly: a single Veo call is capped at 8s; any
  // clip >8s is delivered via the extension chain and billed as a fixed 16s
  // (8s base + 8s extension), and Veo Fast >8s is forced up to Veo 3.1 ($0.40/s).
  const billedSec = perClipSec > 8 ? 16 : Math.min(8, perClipSec)
  let perClipUsd = 0
  if (model.model === 'flow-video-1') {
    const veoRate = perClipSec > 8 ? 0.40 : 0.10
    perClipUsd = veoRate * billedSec
  }
  else if (model.model === 'flow-video-1-pro') perClipUsd = 0.40 * billedSec
  else if (model.providerKey === 'local') perClipUsd = 0
  else perClipUsd = 0.15 // wan (fixed per clip)
  const usd = perClipUsd * clips
  const credits = Math.round(usd * 100)
  return { usd, credits, clips, perClipSec, perClipUsd }
}




function ImageDurationInput({
  id,
  value,
  onCommit,
}: {
  id: string
  value: number
  onCommit: (seconds: number) => void
}) {
  const [text, setText] = useState<string>(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  const commit = () => {
    const n = parseInt(text, 10)
    if (!Number.isFinite(n)) { setText(String(value)); return }
    const clamped = Math.max(1, Math.min(15, n))
    setText(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }
  return (
    <input
      id={id}
      type="number"
      min={1}
      max={15}
      step={1}
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
      }}
      onClick={(e) => e.stopPropagation()}
      aria-label="Image duration in seconds"
      className="w-10 bg-transparent text-center text-zinc-100 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  )
}


function isTerminalStatus(status: string) {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

// A job needs more polling when it isn't terminal, OR when it reports
// "completed" but hasn't yet delivered its video asset. The latter happens with
// synchronous local models (Wan 2.1 / LTX): createJob returns "completed" but
// the seeded card has video: null, so we must fetch the full detail to get the
// rendered clip URL.
function isJobAwaitingResolution(job: JobDetail) {
  if (!isTerminalStatus(job.status)) return true
  return job.status === 'completed' && !job.video?.storage_path
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

// Monotonic per-job cache: progress shown to the user must never go down.
// Keyed by job id; cleared implicitly when the page unmounts.
const progressMaxRef: Map<string, number> = new Map()

function getJobProgressPercent(job: { id?: string; status: string; progress_percent?: number | null; created_at: string; requested_duration?: number | null }): number | null {
  const status = normalizeStatus(job.status)
  if (status === 'completed') {
    if (job.id) progressMaxRef.set(job.id, 100)
    return 100
  }
  if (status === 'failed' || status === 'cancelled') {
    if (job.id) progressMaxRef.delete(job.id)
    return null
  }
  // Time-based estimate is a *fallback only* and is capped at 60 so the UI
  // never falsely implies "almost done" while the provider is still working.
  // Real backend/provider progress is honored as-is up to 99 — only true
  // completion reaches 100.
  const dur = job.requested_duration && job.requested_duration > 0 ? job.requested_duration : 5
  const expectedMs = Math.max(120_000, dur * 30_000)
  const startedAt = Date.parse(job.created_at)
  const elapsed = Number.isFinite(startedAt) ? Date.now() - startedAt : 0
  const ratio = expectedMs > 0 ? elapsed / expectedMs : 0
  const timeBased = Math.max(status === 'pending' ? 8 : 15, Math.min(60, Math.round(15 + ratio * 45)))
  const backend = typeof job.progress_percent === 'number'
    ? Math.max(0, Math.min(99, Math.round(job.progress_percent)))
    : null
  // Prefer the higher of the two, but never let time-based push past 60.
  const next = backend !== null ? Math.max(backend, timeBased) : timeBased
  if (!job.id) return next
  const prev = progressMaxRef.get(job.id) ?? 0
  const monotonic = Math.max(prev, next)
  progressMaxRef.set(job.id, monotonic)
  return monotonic
}

function mergeJob(currentJobs: JobDetail[], nextJob: JobDetail) {
  const remainingJobs = currentJobs.filter((job) => job.id !== nextJob.id)
  return [nextJob, ...remainingJobs].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  )
}

function isMissingJobError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.code === 'NOT_FOUND'
}

function isExpectedBillingError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 402 || error.code === 'INSUFFICIENT_CREDITS')
}

function generationStartErrorMessage(error: unknown, fallback: string): string {
  if (isExpectedBillingError(error)) {
    return 'Not enough credits for this generation. Add credits or choose a lower-cost model/duration.'
  }
  if (error instanceof ApiError) return `${error.code}: ${error.message}`
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function readStoredIdSet(key: string | null): Set<string> {
  if (!key || typeof window === 'undefined') return new Set()
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function readStoredRecord<T>(key: string | null): Record<string, T> {
  if (!key || typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, T> : {}
  } catch {
    return {}
  }
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
  const [promptViewer, setPromptViewer] = useState<string | null>(null)
  const [editPromptJob, setEditPromptJob] = useState<JobDetail | null>(null)
  const [editPromptText, setEditPromptText] = useState('')
  const [startContext] = useState('Start')
  const [endGoal] = useState('End')
  const [generatedVideos, setGeneratedVideos] = useState<JobDetail[]>([])
  // Tracks which card's download is currently being prepared (fetched +
  // transcoded to standard MP4) so we can show a spinner on that button.
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // --- Copyright shield: AI review of the final video + music/voiceover ---
  type CopyrightSection = { status: string; reason?: string; risks?: string[] }
  type CopyrightResult = {
    verdict: string
    summary?: string
    video?: CopyrightSection
    music?: CopyrightSection
  }
  const [copyrightJob, setCopyrightJob] = useState<JobDetail | null>(null)
  const [copyrightLoading, setCopyrightLoading] = useState(false)
  const [copyrightResult, setCopyrightResult] = useState<CopyrightResult | null>(null)
  const [copyrightError, setCopyrightError] = useState<string | null>(null)

  // Download a film as a standard, broadly-compatible MP4. Final Film output
  // is WebM (MediaRecorder), which fails in QuickTime / WMP / mobile galleries.
  // We fetch the stored file and run it through ensureMp4 (ffmpeg.wasm) so the
  // user always gets a .mp4. On any transcode failure (e.g. file too large to
  // process in-browser) we fall back to downloading the original file as-is.
  const downloadAsMp4 = async (cardId: string, url: string, namePrefix: string) => {
    if (downloadingId) return
    setDownloadingId(cardId)
    const triggerDownload = (blob: Blob, filename: string) => {
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    }
    // ffmpeg.wasm transcode is heavy and routinely OOMs / fails to load on
    // mobile browsers. When that happens we used to hand back a WebM file
    // renamed .mp4, which iOS / the mobile gallery cannot play. So on mobile
    // we skip the in-browser transcode entirely and download the original
    // file with its TRUE extension based on the real blob MIME type.
    const isMobile =
      typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    const extFromType = (type: string, fallbackUrl: string): string => {
      const t = (type || '').toLowerCase()
      if (t.includes('mp4')) return 'mp4'
      if (t.includes('webm')) return 'webm'
      if (t.includes('quicktime') || t.includes('mov')) return 'mov'
      const lower = fallbackUrl.toLowerCase().split('?')[0]
      if (lower.endsWith('.mp4')) return 'mp4'
      if (lower.endsWith('.webm')) return 'webm'
      if (lower.endsWith('.mov')) return 'mov'
      return 'mp4'
    }
    try {
      const fetchUrl = await proxiedVideoUrl(url)
      const response = await fetch(fetchUrl)
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const sourceIsMp4 =
        (blob.type || '').toLowerCase().includes('mp4') ||
        url.toLowerCase().split('?')[0].endsWith('.mp4')

      // On mobile, or when the source is already a standard MP4, skip the
      // in-browser transcode and serve the file directly with its real
      // extension so it always opens in the gallery / player.
      if (isMobile || sourceIsMp4) {
        triggerDownload(blob, `${namePrefix}-${cardId.slice(0, 8)}.${extFromType(blob.type, url)}`)
        return
      }

      try {
        const mp4 = await ensureMp4(blob, blob.type)
        triggerDownload(mp4.blob, `${namePrefix}-${cardId.slice(0, 8)}.mp4`)
      } catch (transErr) {
        // Transcode failed (too large / OOM) — hand over the original file
        // with its TRUE extension (never mislabel WebM as .mp4) so the user
        // is never left without a download.
        console.warn('[download] MP4 transcode failed, serving original:', transErr)
        triggerDownload(blob, `${namePrefix}-${cardId.slice(0, 8)}.${extFromType(blob.type, url)}`)
      }
    } catch (err) {
      console.error('Film download failed', err)
      window.open(url, '_blank')
    } finally {
      setDownloadingId(null)
    }
  }
  // Fast, direct download: hands the browser a signed URL with a download
  // Content-Disposition so it streams the file natively — no in-browser fetch
  // into memory and no ffmpeg transcode. Falls back gracefully on failure.
  const downloadDirect = async (cardId: string, url: string, namePrefix: string) => {
    if (downloadingId) return
    setDownloadingId(cardId)
    try {
      const lower = url.toLowerCase().split('?')[0]
      const ext = lower.endsWith('.mp4') ? 'mp4'
        : lower.endsWith('.webm') ? 'webm'
        : lower.endsWith('.mov') ? 'mov'
        : 'mp4'
      const filename = `${namePrefix}-${cardId.slice(0, 8)}.${ext}`

      // For our own private merged-videos / user-videos objects, mint a signed
      // URL with the `download` option so the server sets Content-Disposition.
      let href: string | null = null
      try {
        const parsed = new URL(url)
        const m = parsed.pathname.match(
          /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/(.+)$/,
        )
        if (m) {
          const bucket = m[1]
          let path = m[2]
          try { path = decodeURIComponent(path) } catch { /* keep raw */ }
          if (bucket === MERGED_BUCKET || bucket === 'user-videos') {
            const { data, error } = await supabase.storage
              .from(bucket)
              .createSignedUrl(path, 60 * 60, { download: filename })
            if (!error && data?.signedUrl) href = data.signedUrl
          }
        }
      } catch { /* fall through to proxied URL */ }

      if (!href) href = await proxiedVideoUrl(url)

      const a = document.createElement('a')
      a.href = href
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      console.error('Direct download failed', err)
      window.open(url, '_blank')
    } finally {
      setDownloadingId(null)
    }
  }

  // Resolve a fetchable, signed Supabase-storage URL from either a raw storage
  // path or a (possibly public) storage URL so the edge function can fetch
  // private merged-videos / user objects.
  const signStorageUrl = async (input: string): Promise<string | null> => {
    if (!input) return null
    try {
      let bucket = MERGED_BUCKET
      let path = input
      if (/^https?:\/\//i.test(input)) {
        const parsed = new URL(input)
        const m = parsed.pathname.match(
          /\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/(.+)$/,
        )
        if (!m) return input // unknown shape; let the function try as-is
        bucket = m[1]
        try { path = decodeURIComponent(m[2]) } catch { path = m[2] }
      }
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 30)
      if (!error && data?.signedUrl) return data.signedUrl
      return null
    } catch {
      return null
    }
  }

  // Run a real AI copyright review of the final video + its music/voiceover.
  const runCopyrightCheck = async (video: JobDetail) => {
    const storagePath = video.video?.storage_path
    if (!storagePath) return
    setCopyrightJob(video)
    setCopyrightResult(null)
    setCopyrightError(null)
    setCopyrightLoading(true)
    try {
      const audio = projectAudio[video.id]
      const [videoUrl, musicUrl, voiceoverUrl] = await Promise.all([
        signStorageUrl(storagePath),
        audio?.music?.url ? signStorageUrl(audio.music.url) : Promise.resolve(null),
        audio?.voiceover?.url ? signStorageUrl(audio.voiceover.url) : Promise.resolve(null),
      ])
      if (!videoUrl) throw new Error('Could not prepare the video for analysis.')

      const { data, error } = await supabase.functions.invoke('copyright-check', {
        body: {
          videoUrl,
          musicUrl: musicUrl ?? undefined,
          voiceoverUrl: voiceoverUrl ?? undefined,
        },
      })
      if (error) {
        const status = (error as { context?: { status?: number } })?.context?.status
        if (status === 429) throw new Error('Rate limit reached. Please try again in a moment.')
        if (status === 402) throw new Error('AI credits exhausted. Add credits to continue.')
        throw new Error(error.message || 'Copyright analysis failed.')
      }
      const result = (data as { result?: CopyrightResult } | null)?.result
      if (!result) throw new Error('No analysis result returned.')
      setCopyrightResult(result)
    } catch (err) {
      setCopyrightError(err instanceof Error ? err.message : 'Copyright analysis failed.')
    } finally {
      setCopyrightLoading(false)
    }
  }
  const downloadImageFile = async (imageId: string, url: string) => {
    if (downloadingId) return
    setDownloadingId(imageId)
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const t = (blob.type || '').toLowerCase()
      const ext = t.includes('png') ? 'png'
        : t.includes('webp') ? 'webp'
        : t.includes('jpeg') || t.includes('jpg') ? 'jpg'
        : (url.toLowerCase().split('?')[0].split('.').pop() || 'png')
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `image-${imageId.slice(0, 8)}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('Image download failed', err)
      window.open(url, '_blank')
    } finally {
      setDownloadingId(null)
    }
  }
  // Persist an audio item (uploaded music or generated voiceover) to the
  // private user-audio bucket and track it in generator_user_audio so it shows
  // up in Storage › Audio with download/delete support.
  const persistUserAudio = async (
    blob: Blob,
    kind: 'music' | 'voiceover',
    name: string,
    durationSeconds?: number | null,
  ) => {
    if (!userId) return
    try {
      const type = (blob.type || '').toLowerCase()
      const ext = type.includes('mpeg') || type.includes('mp3') ? 'mp3'
        : type.includes('wav') ? 'wav'
        : type.includes('ogg') ? 'ogg'
        : type.includes('webm') ? 'webm'
        : type.includes('aac') ? 'aac'
        : type.includes('m4a') || type.includes('mp4') ? 'm4a'
        : 'audio'
      const path = `${userId}/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(USER_AUDIO_BUCKET)
        .upload(path, blob, { contentType: blob.type || 'audio/mpeg', upsert: false })
      if (upErr) throw upErr
      await supabase.from('generator_user_audio').insert({
        user_id: userId,
        storage_path: path,
        kind,
        name,
        duration_seconds: durationSeconds && Number.isFinite(durationSeconds) ? durationSeconds : null,
        size_bytes: blob.size,
        mime_type: blob.type || null,
      })
    } catch (err) {
      console.error('Failed to save audio to storage', err)
    }
  }
  const downloadAudioFile = async (audioId: string, url: string | null | undefined, name: string | null) => {
    if (downloadingId || !url) return
    setDownloadingId(audioId)
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const t = (blob.type || '').toLowerCase()
      const ext = t.includes('mpeg') || t.includes('mp3') ? 'mp3'
        : t.includes('wav') ? 'wav'
        : t.includes('ogg') ? 'ogg'
        : t.includes('webm') ? 'webm'
        : t.includes('aac') ? 'aac'
        : t.includes('m4a') || t.includes('mp4') ? 'm4a'
        : (url.toLowerCase().split('?')[0].split('.').pop() || 'mp3')
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const base = (name || `audio-${audioId.slice(0, 8)}`).replace(/\.[^.]+$/, '')
      a.href = blobUrl
      a.download = `${base}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('Audio download failed', err)
      window.open(url, '_blank')
    } finally {
      setDownloadingId(null)
    }
  }
  const handleDeleteUserAudio = async (item: UserAudioItem) => {
    if (!userId) return
    setArchiveAudio((curr) => curr.filter((a) => a.id !== item.id))
    try {
      await supabase
        .from('generator_user_audio')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', item.id)
        .eq('user_id', userId)
      await supabase.storage.from(USER_AUDIO_BUCKET).remove([item.storage_path])
    } catch (err) {
      console.error('Failed to delete audio', err)
    }
  }
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
  const [isProductAdOpen, setIsProductAdOpen] = useState(false)
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
  // ----- Storage archive: every film the user ever made, read live from the
  // server (independent of drafts/library local state). -----
  const [isArchiveOpen, setIsArchiveOpen] = useState(false)
  const [archiveTab, setArchiveTab] = useState<'films' | 'images' | 'audio' | 'products'>('films')
  const [archiveJobs, setArchiveJobs] = useState<JobSummary[]>([])
  const [archiveVideos, setArchiveVideos] = useState<VideoSummary[]>([])
  const [archiveImages, setArchiveImages] = useState<UserImageItem[]>([])
  const [archiveProductImages, setArchiveProductImages] = useState<UserImageItem[]>([])
  const [archiveAudio, setArchiveAudio] = useState<UserAudioItem[]>([])
  const productPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploadingProductPhoto, setIsUploadingProductPhoto] = useState(false)
  const [productUploadError, setProductUploadError] = useState<string | null>(null)
  const [productName, setProductName] = useState('')
  const [renamingProductId, setRenamingProductId] = useState<string | null>(null)
  const [renameProductValue, setRenameProductValue] = useState('')
  const [archiveLoading, setArchiveLoading] = useState(false)
  const loadArchive = async () => {
    setArchiveLoading(true)
    try {
      const [jobs, videos, imagesRes, audioRes] = await Promise.all([
        jobOrchestratorGateway.listMyJobs(200).catch(() => [] as JobSummary[]),
        videoLibraryGateway.listMyVideos(200).catch(() => [] as VideoSummary[]),
        userId
          ? supabase
              .from('generator_user_images')
              .select('id, storage_path, created_at, still_duration_seconds, width, height, category, title, draft_group_id')
              .eq('user_id', userId)
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as UserImageItem[] }),
        userId
          ? supabase
              .from('generator_user_audio')
              .select('id, storage_path, kind, name, duration_seconds, created_at')
              .eq('user_id', userId)
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as UserAudioItem[] }),
      ])
      setArchiveJobs(jobs)
      setArchiveVideos(videos)
      const allImages = ((imagesRes as { data?: UserImageItem[] }).data ?? []) as UserImageItem[]
      setArchiveImages(allImages.filter((i) => (i.category ?? 'general') !== 'product'))
      setArchiveProductImages(allImages.filter((i) => (i.category ?? 'general') === 'product'))
      const audioRows = ((audioRes as { data?: UserAudioItem[] }).data ?? []) as UserAudioItem[]
      // Generate short-lived signed URLs for private-bucket playback.
      const withUrls = await Promise.all(
        audioRows.map(async (a) => {
          try {
            const { data } = await supabase.storage
              .from(USER_AUDIO_BUCKET)
              .createSignedUrl(a.storage_path, 60 * 60)
            return { ...a, url: data?.signedUrl ?? null }
          } catch {
            return { ...a, url: null }
          }
        }),
      )
      setArchiveAudio(withUrls)
    } finally {
      setArchiveLoading(false)
    }
  }
  const [deletingArchiveId, setDeletingArchiveId] = useState<string | null>(null)
  const [playerFilm, setPlayerFilm] = useState<{ jobId: string; storagePath: string; poster: string | null; title: string } | null>(null)
  const handleDeleteArchiveJob = async (jobId: string) => {
    setDeletingArchiveId(jobId)
    try {
      await jobOrchestratorGateway.deleteJob(jobId)
      setArchiveJobs((prev) => prev.filter((j) => j.id !== jobId))
      setArchiveVideos((prev) => prev.filter((v) => v.job_id !== jobId))
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      if (typeof window !== 'undefined') window.alert(`Delete failed: ${msg}`)
    } finally {
      setDeletingArchiveId(null)
    }
  }
  // ----- Storage bulk selection (Select All + delete selected) -----
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  // Clear selection whenever the tab changes or the dialog opens/closes.
  useEffect(() => {
    setSelectedArchiveIds(new Set())
  }, [archiveTab, isArchiveOpen])
  const toggleArchiveSelection = (id: string) => {
    setSelectedArchiveIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const handleBulkDeleteArchive = async () => {
    const ids = Array.from(selectedArchiveIds)
    if (ids.length === 0) return
    setIsBulkDeleting(true)
    try {
      for (const id of ids) {
        try {
          if (archiveTab === 'films') {
            await handleDeleteArchiveJob(id)
          } else if (archiveTab === 'images' || archiveTab === 'products') {
            await handleDeleteUserImage(id)
          } else {
            const item = archiveAudio.find((a) => a.id === id)
            if (item) await handleDeleteUserAudio(item)
          }
        } catch {
          /* keep going with the rest */
        }
      }
      setSelectedArchiveIds(new Set())
    } finally {
      setIsBulkDeleting(false)
    }
  }
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [hasOccasionToday, setHasOccasionToday] = useState(false)

  // Deterministic daily check: is today a curated MAJOR occasion?
  // No AI / network — avoids false positives from hallucinated dates.
  useEffect(() => {
    setHasOccasionToday(getMajorOccasionForDate(new Date()) !== null)
  }, [])





  const [generationMode, setGenerationMode] = useState<'image-to-video' | 'text-to-video'>('image-to-video')
  const [durationSeconds, setDurationSeconds] = useState<5 | 10 | 15 | 30 | 45 | 135>(5)
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
  const getRatioFor = (
    video:
      | {
          id: string
          requested_aspect_ratio?: string | null
          video?: { aspect_ratio?: string | null } | null
        }
      | null
      | undefined,
  ): Ratio => {
    if (!video) return aspectRatio
    // 1) Local map gives instant, in-session reactivity.
    const local = clipAspectRatios[video.id]
    if (local) return local
    // 2) Real provider aspect ratio on the asset (ignored when it's a
    //    non-ratio label like "720P" — normalizeRatio returns null).
    const fromAsset = normalizeRatio(video.video?.aspect_ratio ?? null)
    if (fromAsset) return fromAsset
    // 3) The user's chosen ratio, durably persisted in the database. This is
    //    the authoritative source that survives sign-out / localStorage clears.
    const fromRequested = normalizeRatio(video.requested_aspect_ratio ?? null)
    if (fromRequested) return fromRequested
    // 4) Last-resort fallback.
    return '16:9'
  }
  // Rehydrate the local ratio map from the database-backed source of truth.
  // `requested_aspect_ratio` (and any valid asset `aspect_ratio`) is persisted
  // server-side, so after a refresh or sign-out the local map is rebuilt and
  // each card keeps the exact ratio the user chose — never silently 16:9.
  useEffect(() => {
    for (const job of generatedVideos) {
      if (!job?.id) continue
      const fromAsset = normalizeRatio(job.video?.aspect_ratio ?? null)
      const fromRequested = normalizeRatio(job.requested_aspect_ratio ?? null)
      const r = fromAsset ?? fromRequested
      if (r) rememberClipRatio(job.id, r)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedVideos])
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
  const [v2vJobId, setV2vJobId] = useState<string | null>(null)
  const [v2vSrc, setV2vSrc] = useState<string | null>(null)
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

  // Per-project snapshot of the music / voiceover used in each Final Film.
  // Stores durable public URLs (copied into MERGED_BUCKET at finalize time) so
  // the finalized card can play + download the exact audio that project used.
  type ProjectAudioTrack = { url: string; name: string }
  type ProjectAudio = { music?: ProjectAudioTrack; voiceover?: ProjectAudioTrack }
  const [projectAudio, setProjectAudio] = useState<Record<string, ProjectAudio>>({})
  const projectAudioKey = userId ? `project-audio:${userId}` : null
  useEffect(() => {
    if (!projectAudioKey) { setProjectAudio({}); return }
    try {
      const raw = window.localStorage.getItem(projectAudioKey)
      const obj = raw ? (JSON.parse(raw) as Record<string, ProjectAudio>) : {}
      setProjectAudio(obj && typeof obj === 'object' ? obj : {})
    } catch { setProjectAudio({}) }
  }, [projectAudioKey])
  function persistProjectAudio(next: Record<string, ProjectAudio>) {
    if (!projectAudioKey) return
    try {
      window.localStorage.setItem(projectAudioKey, JSON.stringify(next))
    } catch { /* ignore */ }
  }

  // Persist a music/voiceover source into the public MERGED_BUCKET so it
  // survives refresh and project switches. Returns a durable public URL, or
  // null on failure. Reused by both Final Film finalize and Draft snapshots.
  const persistAudioToStorage = useCallback(
    async (src: string, kind: 'music' | 'voice', id: string): Promise<string | null> => {
      if (!userId) return null
      const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
        Promise.race([
          p,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('audio snapshot timed out')), ms),
          ),
        ])
      try {
        const resp = await withTimeout(fetch(src), 60_000)
        if (!resp.ok) throw new Error(`fetch ${resp.status}`)
        const blob = await withTimeout(resp.blob(), 60_000)
        const ct = (blob.type || 'audio/mpeg').toLowerCase()
        const ext = ct.includes('mpeg') || ct.includes('mp3') ? 'mp3'
          : ct.includes('wav') ? 'wav'
          : ct.includes('ogg') ? 'ogg'
          : ct.includes('webm') ? 'webm'
          : ct.includes('aac') ? 'aac'
          : ct.includes('m4a') || ct.includes('mp4') ? 'm4a'
          : 'mp3'
        const path = `${userId}/project-${kind}-${id}.${ext}`
        const up = await withTimeout(
          supabase.storage
            .from(MERGED_BUCKET)
            .upload(path, blob, { contentType: blob.type || 'audio/mpeg', upsert: true }),
          90_000,
        )
        if (up.error) throw new Error(up.error.message)
        return supabase.storage.from(MERGED_BUCKET).getPublicUrl(path).data.publicUrl ?? null
      } catch (err) {
        console.warn(`[audio-snapshot] ${kind} persist failed`, err)
        return null
      }
    },
    [userId],
  )


  // The in-progress workspace (clips + images that haven't been merged into a
  // Final Film yet) is auto-snapshotted into a Draft project so it survives
  // refresh / Start Over. One active draft id per user session; closes (is
  // cleared) when Final Film succeeds.
  const [draftEntries, setDraftEntries] = useState<JobDetail[]>([])
  const [draftSourceJobs, setDraftSourceJobs] = useState<Record<string, JobDetail[]>>({})
  const [draftSourceImages, setDraftSourceImages] = useState<Record<string, UserImageItem[]>>({})
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const draftEntriesKey = userId ? `draft-entries:${userId}` : null
  const draftSourceJobsKey = userId ? `draft-source-jobs:${userId}` : null
  const draftSourceImagesKey = userId ? `draft-source-images:${userId}` : null
  const activeDraftIdKey = userId ? `active-draft-id:${userId}` : null
  useEffect(() => {
    if (!draftEntriesKey) { setDraftEntries([]); return }
    try {
      const raw = window.localStorage.getItem(draftEntriesKey)
      const arr = raw ? (JSON.parse(raw) as JobDetail[]) : []
      setDraftEntries(Array.isArray(arr) ? arr : [])
    } catch { setDraftEntries([]) }
  }, [draftEntriesKey])
  useEffect(() => {
    if (!draftSourceJobsKey) { setDraftSourceJobs({}); return }
    try {
      const raw = window.localStorage.getItem(draftSourceJobsKey)
      const obj = raw ? (JSON.parse(raw) as Record<string, JobDetail[]>) : {}
      setDraftSourceJobs(obj && typeof obj === 'object' ? obj : {})
    } catch { setDraftSourceJobs({}) }
  }, [draftSourceJobsKey])
  useEffect(() => {
    if (!draftSourceImagesKey) { setDraftSourceImages({}); return }
    try {
      const raw = window.localStorage.getItem(draftSourceImagesKey)
      const obj = raw ? (JSON.parse(raw) as Record<string, UserImageItem[]>) : {}
      setDraftSourceImages(obj && typeof obj === 'object' ? obj : {})
    } catch { setDraftSourceImages({}) }
  }, [draftSourceImagesKey])
  useEffect(() => {
    if (!activeDraftIdKey) { setActiveDraftId(null); return }
    try {
      const raw = window.localStorage.getItem(activeDraftIdKey)
      setActiveDraftId(raw && typeof raw === 'string' ? raw : null)
    } catch { setActiveDraftId(null) }
  }, [activeDraftIdKey])
  function persistDraftEntries(next: JobDetail[]) {
    if (!draftEntriesKey) return
    try { window.localStorage.setItem(draftEntriesKey, JSON.stringify(next)) } catch { /* ignore */ }
  }
  function persistDraftSourceJobs(next: Record<string, JobDetail[]>) {
    if (!draftSourceJobsKey) return
    try { window.localStorage.setItem(draftSourceJobsKey, JSON.stringify(next)) } catch { /* ignore */ }
  }
  function persistDraftSourceImages(next: Record<string, UserImageItem[]>) {
    if (!draftSourceImagesKey) return
    try { window.localStorage.setItem(draftSourceImagesKey, JSON.stringify(next)) } catch { /* ignore */ }
  }
  function persistActiveDraftId(next: string | null) {
    if (!activeDraftIdKey) return
    try {
      if (next) window.localStorage.setItem(activeDraftIdKey, next)
      else window.localStorage.removeItem(activeDraftIdKey)
    } catch { /* ignore */ }
  }

  // Permanent ownership maps: every generated clip / uploaded image belongs to
  // EXACTLY one draft, stamped at creation time. Draft snapshots are derived
  // from these maps (not from "is it live in the workspace"), which is what
  // guarantees a clip can never leak into another draft project.
  const [jobDraftMap, setJobDraftMap] = useState<Record<string, string>>({})
  const [imageDraftMap, setImageDraftMap] = useState<Record<string, string>>({})
  const jobDraftMapKey = userId ? `job-draft-map:${userId}` : null
  const imageDraftMapKey = userId ? `image-draft-map:${userId}` : null
  useEffect(() => {
    if (!jobDraftMapKey) { setJobDraftMap({}); return }
    try {
      const raw = window.localStorage.getItem(jobDraftMapKey)
      const obj = raw ? (JSON.parse(raw) as Record<string, string>) : {}
      setJobDraftMap(obj && typeof obj === 'object' ? obj : {})
    } catch { setJobDraftMap({}) }
  }, [jobDraftMapKey])
  useEffect(() => {
    if (!imageDraftMapKey) { setImageDraftMap({}); return }
    try {
      const raw = window.localStorage.getItem(imageDraftMapKey)
      const obj = raw ? (JSON.parse(raw) as Record<string, string>) : {}
      setImageDraftMap(obj && typeof obj === 'object' ? obj : {})
    } catch { setImageDraftMap({}) }
  }, [imageDraftMapKey])
  function persistJobDraftMap(next: Record<string, string>) {
    if (!jobDraftMapKey) return
    try { window.localStorage.setItem(jobDraftMapKey, JSON.stringify(next)) } catch { /* ignore */ }
  }
  function persistImageDraftMap(next: Record<string, string>) {
    if (!imageDraftMapKey) return
    try { window.localStorage.setItem(imageDraftMapKey, JSON.stringify(next)) } catch { /* ignore */ }
  }

  // Ensure there is an active draft id; create + persist one if needed.
  // Returns the id to stamp newly-created clips/images with.
  const ensureActiveDraftIdRef = useRef<string | null>(null)
  ensureActiveDraftIdRef.current = activeDraftId
  function ensureActiveDraftId(): string {
    let did = ensureActiveDraftIdRef.current
    if (!did) {
      did = `draft-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`
      ensureActiveDraftIdRef.current = did
      setActiveDraftId(did)
      persistActiveDraftId(did)
    }
    return did
  }
  // The durable server-side group id is the bare uuid embedded in a
  // `draft-<uuid>` draft id. New sessions always use that format, so every
  // clip/image created together is stamped with the same uuid server-side and
  // regroups into ONE draft project after refresh / on any device.
  function draftGroupUuid(draftId: string | null | undefined): string | undefined {
    if (!draftId) return undefined
    const m = draftId.match(
      /^draft-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    )
    return m ? m[1] : undefined
  }
  // Returns the active session's server group id (uuid), creating the active
  // draft if needed. Call right before createJob so the new clip is owned by
  // the same project as its siblings.
  function ensureActiveDraftGroupId(): string | undefined {
    return draftGroupUuid(ensureActiveDraftId())
  }
  // Canonical draft id form for a server group uuid. Equals the activeDraftId
  // that originally created the clips, so server + local grouping never clash.
  function draftIdForGroupUuid(uuid: string): string {
    return `draft-${uuid}`
  }
  function stampJobDraft(jobId: string, draftId: string) {
    setJobDraftMap((prev) => {
      if (prev[jobId] === draftId) return prev
      const next = { ...prev, [jobId]: draftId }
      persistJobDraftMap(next)
      return next
    })
  }
  function stampImageDraft(imageId: string, draftId: string) {
    setImageDraftMap((prev) => {
      if (prev[imageId] === draftId) return prev
      const next = { ...prev, [imageId]: draftId }
      persistImageDraftMap(next)
      return next
    })
  }


  // Film covers — one AI-generated cover image per draft/project scope.
  // Keyed by activeDraftId (or selectedProjectId for finalized projects).
  // Persisted to localStorage so covers survive refresh.
  const [coverImages, setCoverImages] = useState<Record<string, UserImageItem>>({})
  const coverImagesKey = userId ? `project-cover-images:${userId}` : null
  useEffect(() => {
    if (!coverImagesKey) { setCoverImages({}); return }
    try {
      const raw = window.localStorage.getItem(coverImagesKey)
      const obj = raw ? (JSON.parse(raw) as Record<string, UserImageItem>) : {}
      const safe = obj && typeof obj === 'object' ? { ...obj } : {}
      // Drop any legacy workspace-wide cover so it can't leak across projects.
      if ('__workspace__' in safe) {
        delete (safe as Record<string, UserImageItem>)['__workspace__']
        try { window.localStorage.setItem(coverImagesKey, JSON.stringify(safe)) } catch { /* ignore */ }
      }
      setCoverImages(safe)
    } catch { setCoverImages({}) }
  }, [coverImagesKey])
  function persistCoverImages(next: Record<string, UserImageItem>) {
    if (!coverImagesKey) return
    try { window.localStorage.setItem(coverImagesKey, JSON.stringify(next)) } catch { /* ignore */ }
  }
  // Dialog mode: 'frame' stages the AI image as a Start frame for image-to-video;
  // 'cover' pins it as the film cover at the top of Pending.
  const [aiDialogMode, setAiDialogMode] = useState<'frame' | 'cover'>('frame')


  // Tombstone set: draft ids (and the underlying clip/image ids they wrap)
  // that the user explicitly deleted. The backfill effect skips anything in
  // this set so deletion survives refresh.
  const [deletedDraftIds, setDeletedDraftIds] = useState<Set<string>>(new Set())
  const deletedDraftIdsKey = userId ? `deleted-draft-ids:${userId}` : null
  useEffect(() => {
    if (!deletedDraftIdsKey) { setDeletedDraftIds(new Set()); return }
    try {
      const raw = window.localStorage.getItem(deletedDraftIdsKey)
      const arr = raw ? (JSON.parse(raw) as string[]) : []
      setDeletedDraftIds(new Set(Array.isArray(arr) ? arr : []))
    } catch { setDeletedDraftIds(new Set()) }
  }, [deletedDraftIdsKey])
  function persistDeletedDraftIds(next: Set<string>) {
    if (!deletedDraftIdsKey) return
    try { window.localStorage.setItem(deletedDraftIdsKey, JSON.stringify(Array.from(next))) } catch { /* ignore */ }
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

  // Creation-site helpers: stamp a brand-new clip / image to the current
  // active draft (creating one if needed) AND mark it active. Use these at
  // generation sites so each new film's clips are permanently owned by one
  // draft. Do NOT use for hydration/restore of existing jobs.
  function markNewClip(id: string) {
    const did = ensureActiveDraftId()
    stampJobDraft(id, did)
    markActiveJob(id)
  }
  // Synchronous local models (Wan 2.1 / LTX) return status "completed" straight
  // from createJob, but the seeded card has video: null. Fetch the full detail
  // immediately so the preview shows the rendered clip without waiting for the
  // polling loop (or a page reload). Failures are harmless — polling will retry.
  function hydrateIfComplete(result: CreateJobResult) {
    if (result.status !== 'completed') return
    void jobOrchestratorGateway
      .getJob(result.jobId)
      .then((detail) => {
        setGeneratedVideos((curr) => mergeJob(curr, detail))
      })
      .catch(() => {})
  }
  function markNewImage(id: string) {
    const did = ensureActiveDraftId()
    stampImageDraft(id, did)
    markActiveImage(id)
  }
  // A derived clip (regenerate / video-to-video) belongs to the SAME draft as
  // its source clip, so it stays inside the same film instead of leaking into
  // the current active draft. Falls back to the active draft when the source
  // has no mapping yet.
  function markDerivedClip(sourceId: string, newId: string) {
    const did = jobDraftMap[sourceId] ?? ensureActiveDraftId()
    stampJobDraft(newId, did)
    markActiveJob(newId)
  }



  // When set, HISTORY is filtered to show only the source clips of this
  // Library project. Cleared by Start Over or by the inline "Clear" button.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  // A finalized "Final video" project is open when a project is selected and
  // its id is NOT a draft. Such projects are READ-ONLY: the user may watch,
  // download, and delete them, but cannot edit/resume/extend them.
  const isReadOnlyProject = !!selectedProjectId && !selectedProjectId.startsWith('draft-')

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

  // Single source of truth for what a Draft card should display. A draft's
  // own `entry.video` can be stale/empty (e.g. its first clip had no
  // storage_path the moment the snapshot was taken), so we always prefer the
  // first PLAYABLE clip/image from the draft's snapshot maps. Returns the
  // best preview asset plus the real clip count.
  const resolveDraftDisplay = (
    draftId: string,
    entry?: JobDetail,
  ): { video: JobDetail['video']; clipCount: number; hasPlayable: boolean } => {
    const clips = draftSourceJobs[draftId] ?? []
    const images = draftSourceImages[draftId] ?? []
    const clipCount = clips.length + images.length

    // 1) First clip that actually has a storage_path.
    const firstClip = clips.find((c) => !!c.video?.storage_path)
    if (firstClip?.video?.storage_path) {
      return {
        video: {
          id: firstClip.video.id ?? draftId,
          storage_path: firstClip.video.storage_path,
          thumbnail_url: firstClip.video.thumbnail_url ?? null,
          aspect_ratio: firstClip.video.aspect_ratio ?? entry?.requested_aspect_ratio ?? null,
          duration: firstClip.video.duration ?? null,
        },
        clipCount,
        hasPlayable: true,
      }
    }

    // 2) First image with a storage_path.
    const firstImg = images.find((i) => !!i.storage_path)
    if (firstImg?.storage_path) {
      return {
        video: {
          id: draftId,
          storage_path: firstImg.storage_path,
          thumbnail_url: firstImg.storage_path,
          aspect_ratio: entry?.requested_aspect_ratio ?? null,
          duration: null,
        },
        clipCount,
        hasPlayable: true,
      }
    }

    // 3) Fall back to the entry's own stored asset only if it is real.
    if (entry?.video?.storage_path) {
      return { video: entry.video, clipCount, hasPlayable: true }
    }

    return { video: entry?.video ?? null, clipCount, hasPlayable: false }
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
    // Look across every snapshot source we render cards from, not just
    // visibleVideos, so Trim works on project/draft snapshot cards too.
    const findById = (id: string): JobDetail | undefined => {
      const live = generatedVideos.find((v) => v.id === id)
      if (live) return live
      const merged = mergedEntries.find((v) => v.id === id)
      if (merged) return merged
      for (const arr of Object.values(projectSourceJobs)) {
        const hit = arr.find((v) => v.id === id)
        if (hit) return hit
      }
      for (const arr of Object.values(draftSourceJobs)) {
        const hit = arr.find((v) => v.id === id)
        if (hit) return hit
      }
      return librarySavedJobs[id]
    }
    const job = findById(trimmingJobId)
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

  // Resolve a CORS-safe URL for the Video-to-Video dialog. Same lookup as Trim.
  useEffect(() => {
    let cancelled = false
    if (!v2vJobId) {
      setV2vSrc(null)
      return
    }
    const edited = editedClips[v2vJobId]?.url
    if (edited) {
      setV2vSrc(edited)
      return
    }
    const findById = (id: string): JobDetail | undefined => {
      const live = generatedVideos.find((v) => v.id === id)
      if (live) return live
      const merged = mergedEntries.find((v) => v.id === id)
      if (merged) return merged
      for (const arr of Object.values(projectSourceJobs)) {
        const hit = arr.find((v) => v.id === id)
        if (hit) return hit
      }
      for (const arr of Object.values(draftSourceJobs)) {
        const hit = arr.find((v) => v.id === id)
        if (hit) return hit
      }
      return librarySavedJobs[id]
    }
    const job = findById(v2vJobId)
    const raw = job?.video?.storage_path
    if (!raw) {
      setV2vSrc(null)
      return
    }
    setV2vSrc(null)
    proxiedVideoUrl(raw)
      .then((u) => { if (!cancelled) setV2vSrc(u) })
      .catch(() => { if (!cancelled) setV2vSrc(raw) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v2vJobId])

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
    // Hard timeout so a hung upload / edge call can never leave the dialog
    // stuck on "Saving…" forever. The user will see a real error instead.
    const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | null = null
      try {
        return await Promise.race([
          p,
          new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
          }),
        ])
      } finally {
        if (timer) clearTimeout(timer)
      }
    }
    try {
      const contentType = ext === 'webm' ? 'video/webm' : 'video/mp4'
      const path = `${userId}/edited-${jobId}-${Date.now()}.${ext}`
      const up = await withTimeout(
        supabase.storage.from(MERGED_BUCKET).upload(path, blob, { contentType, upsert: false }),
        90_000,
        'Upload',
      )
      if (up.error) throw new Error(up.error.message)
      const { data } = supabase.storage.from(MERGED_BUCKET).getPublicUrl(path)
      const publicUrl = data.publicUrl

      // Replace the asset row in the backend. Look the job up across every
      // snapshot source so this works for project/draft cards too.
      const job =
        generatedVideos.find((j) => j.id === jobId) ??
        mergedEntries.find((j) => j.id === jobId) ??
        Object.values(projectSourceJobs).flat().find((j) => j.id === jobId) ??
        Object.values(draftSourceJobs).flat().find((j) => j.id === jobId) ??
        librarySavedJobs[jobId]
      const aspect = job?.video?.aspect_ratio ?? undefined
      const updated = await withTimeout(
        jobOrchestratorGateway.updateEditedVideo({
          jobId,
          storagePath: publicUrl,
          durationSeconds: Math.round(newDuration),
          aspectRatio: aspect,
        }),
        60_000,
        'Save',
      )
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
      // Re-throw so the dialog leaves its busy state and shows the error
      // instead of appearing to hang on 100%.
      throw err instanceof Error ? err : new Error(msg)
    }
  }
  const [transitions, setTransitions] = useState<Record<string, TransitionId>>({})
  const [mergedEntries, setMergedEntries] = useState<JobDetail[]>([])
  const [isMerging, setIsMerging] = useState(false)
  const [mergeProgress, setMergeProgress] = useState<number>(0)
  const [mergeStage, setMergeStage] = useState<
    'recording' | 'encoding' | 'uploading' | 'finalizing' | null
  >(null)
  const mergeAbortRef = useRef<AbortController | null>(null)
  // Transient preview of the latest Final Film output. Lives only in memory:
  // never added to Pending, Library, or History. Cleared on Start Over.
  const [lastMergedPreview, setLastMergedPreview] = useState<
    { url: string; ratio: Ratio; clipCount: number } | null
  >(null)
  // --- Background music for the Final Film ---
  const [musicName, setMusicName] = useState<string | null>(null)
  const [musicUrl, setMusicUrl] = useState<string | null>(null)
  const [musicDuration, setMusicDuration] = useState<number>(0)
  const [musicRange, setMusicRange] = useState<[number, number]>([0, 0])
  // Placement of the music on the video timeline [start, end] in seconds.
  const [musicTimeline, setMusicTimeline] = useState<[number, number]>([0, 0])
  const [soundtrackMode, setSoundtrackMode] = useState<'music-only' | 'mix'>('mix')
  const [clipVolume, setClipVolume] = useState<number>(1)
  const [musicVolume, setMusicVolume] = useState<number>(1)
  const [isMusicDialogOpen, setIsMusicDialogOpen] = useState(false)
  const [isVoiceoverOpen, setIsVoiceoverOpen] = useState(false)
  
  const [isReframeOpen, setIsReframeOpen] = useState(false)
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null)
  const [voiceoverName, setVoiceoverName] = useState<string | null>(null)
  const [voiceoverVolume, setVoiceoverVolume] = useState<number>(1)
  const [voiceoverClipVolume, setVoiceoverClipVolume] = useState<number>(0.3)
  const [voiceoverDuration, setVoiceoverDuration] = useState<number>(0)
  // Source window inside the voiceover file [start, end] in seconds.
  const [voiceoverRange, setVoiceoverRange] = useState<[number, number]>([0, 0])
  // Placement of the voiceover on the video timeline [start, end] in seconds.
  const [voiceoverTimeline, setVoiceoverTimeline] = useState<[number, number]>([0, 0])
  const voiceoverWaveformRef = useRef<SoundtrackWaveformHandle | null>(null)
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

  // ---- Library bulk selection (Drafts / Final videos) ----
  const [draftSelectMode, setDraftSelectMode] = useState(false)
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set())
  const [finalSelectMode, setFinalSelectMode] = useState(false)
  const [selectedFinalIds, setSelectedFinalIds] = useState<Set<string>>(new Set())

  function toggleSelectId(variant: 'final' | 'draft', id: string) {
    const setIds = variant === 'final' ? setSelectedFinalIds : setSelectedDraftIds
    setIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulkDeleteSelected(variant: 'final' | 'draft') {
    const ids = Array.from(variant === 'final' ? selectedFinalIds : selectedDraftIds)
    if (ids.length === 0) return
    const label = variant === 'final' ? 'final video' : 'draft'
    const confirmMsg = `Delete ${ids.length} selected ${label}${ids.length === 1 ? '' : 's'} permanently?`
    if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) return
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      await deleteCardConfirmed(id)
    }
    if (variant === 'final') {
      setSelectedFinalIds(new Set())
      setFinalSelectMode(false)
    } else {
      setSelectedDraftIds(new Set())
      setDraftSelectMode(false)
    }
  }

  async function deleteCard(jobId: string) {
    const confirmMsg = jobId.startsWith('draft-')
      ? 'Delete this draft and all its clips permanently?'
      : 'Delete this video card permanently?'
    if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) return
    await deleteCardConfirmed(jobId)
  }

  async function deleteCardConfirmed(jobId: string) {

    // Draft project card: permanently delete the underlying clips/images
    // server-side, then drop the local snapshot, and tombstone the ids so
    // the backfill effect doesn't bring them back on refresh.
    if (jobId.startsWith('draft-')) {
      const clipIds = (draftSourceJobs[jobId] ?? []).map((c) => c.id)
      const imageIds = (draftSourceImages[jobId] ?? []).map((i) => i.id)

      // Tombstone first so the backfill never re-creates these while we
      // wait for the server deletes to finish.
      setDeletedDraftIds((prev) => {
        const next = new Set(prev)
        next.add(jobId)
        for (const id of clipIds) next.add(id)
        for (const id of imageIds) next.add(id)
        persistDeletedDraftIds(next)
        return next
      })

      // Drop local snapshots immediately.
      setDraftEntries((prev) => {
        if (!prev.some((d) => d.id === jobId)) return prev
        const next = prev.filter((d) => d.id !== jobId)
        persistDraftEntries(next)
        return next
      })
      setDraftSourceJobs((prev) => {
        if (!(jobId in prev)) return prev
        const { [jobId]: _drop, ...rest } = prev
        persistDraftSourceJobs(rest)
        return rest
      })
      setDraftSourceImages((prev) => {
        if (!(jobId in prev)) return prev
        const { [jobId]: _drop, ...rest } = prev
        persistDraftSourceImages(rest)
        return rest
      })
      if (activeDraftId === jobId) {
        setActiveDraftId(null)
        persistActiveDraftId(null)
      }
      if (selectedProjectId === jobId) setSelectedProjectId(null)
      if (previewVideoId === jobId) setPreviewVideoId(null)

      // Optimistic in-memory removal of the underlying clips/images so they
      // disappear from every other view too.
      if (clipIds.length > 0) {
        const drop = new Set(clipIds)
        setGeneratedVideos((curr) => curr.filter((v) => !drop.has(v.id)))
        unmarkActiveJobs(clipIds)
      }
      if (imageIds.length > 0) {
        const drop = new Set(imageIds)
        setUserImages((curr) => curr.filter((i) => !drop.has(i.id)))
        unmarkActiveImages(imageIds)
      }

      // Drop draft ownership mappings for the removed clips/images so the
      // grouping effect can never rebuild this draft from stale entries.
      if (clipIds.length > 0) {
        setJobDraftMap((prev) => {
          let changed = false
          const next = { ...prev }
          for (const id of clipIds) { if (id in next) { delete next[id]; changed = true } }
          if (!changed) return prev
          persistJobDraftMap(next)
          return next
        })
      }
      if (imageIds.length > 0) {
        setImageDraftMap((prev) => {
          let changed = false
          const next = { ...prev }
          for (const id of imageIds) { if (id in next) { delete next[id]; changed = true } }
          if (!changed) return prev
          persistImageDraftMap(next)
          return next
        })
      }


      // Permanently purge the underlying clips and images from Storage. Each
      // clip id is a real server job id, so deleteJob removes the DB row AND
      // the video file; deleteUserImage does the same for image assets.
      const results = await Promise.allSettled([
        ...clipIds.map((id) => jobOrchestratorGateway.deleteJob(id)),
        ...imageIds.map((id) => generatorUiGateway.deleteUserImage(id)),
      ])
      const firstError = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
      if (firstError) {
        const reason = firstError.reason
        const msg = reason instanceof ApiError ? reason.message : (reason as Error)?.message ?? 'Unknown error'
        if (typeof window !== 'undefined') window.alert(`Some files could not be deleted: ${msg}`)
      }
      return
    }




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
    // Drop the per-project audio snapshot for a deleted final film.
    if (isMerged && jobId in projectAudio) {
      const { [jobId]: _dropAudio, ...rest } = projectAudio
      setProjectAudio(rest)
      persistProjectAudio(rest)
    }



    // Also prune draft snapshots so deleted clips/images cannot be revived
    // when a draft project is currently selected (the right-side Working
    // clips list reads from draftSourceJobs / draftSourceImages in that mode).
    {
      const nextDraftJobs: Record<string, JobDetail[]> = {}
      let jobsChanged = false
      for (const [did, clips] of Object.entries(draftSourceJobs)) {
        const filtered = clips.filter((c) => c.id !== jobId)
        if (filtered.length !== clips.length) jobsChanged = true
        nextDraftJobs[did] = filtered
      }
      if (jobsChanged) {
        setDraftSourceJobs(nextDraftJobs)
        persistDraftSourceJobs(nextDraftJobs)
      }

      if (isMerged) {
        const nextDraftImgs: Record<string, UserImageItem[]> = {}
        for (const [did, imgs] of Object.entries(draftSourceImages)) {
          if (did === jobId) continue
          nextDraftImgs[did] = imgs
        }
        if (Object.keys(nextDraftImgs).length !== Object.keys(draftSourceImages).length) {
          setDraftSourceImages(nextDraftImgs)
          persistDraftSourceImages(nextDraftImgs)
        }
      }

      // Drop any draft entry that is now empty (no clips and no images).
      const emptyDraftIds = new Set<string>()
      for (const did of new Set([...Object.keys(nextDraftJobs), ...Object.keys(draftSourceImages)])) {
        const clipsLeft = (nextDraftJobs[did] ?? draftSourceJobs[did] ?? []).length
        const imgsLeft = (draftSourceImages[did] ?? []).length
        if (clipsLeft === 0 && imgsLeft === 0) emptyDraftIds.add(did)
      }
      if (emptyDraftIds.size > 0) {
        setDraftEntries((prev) => {
          const next = prev.filter((d) => !emptyDraftIds.has(d.id))
          if (next.length === prev.length) return prev
          persistDraftEntries(next)
          return next
        })
      }
    }
    if (isMerged && selectedProjectId === jobId) setSelectedProjectId(null)

    // Optimistic UI removal — remove from in-memory list immediately.
    setGeneratedVideos((current) => current.filter((v) => v.id !== jobId))
    unmarkActiveJobs([jobId])
    // Drop this clip's draft ownership so its draft can't be rebuilt from it.
    setJobDraftMap((prev) => {
      if (!(jobId in prev)) return prev
      const { [jobId]: _drop, ...rest } = prev
      persistJobDraftMap(rest)
      return rest
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
        // Real job: permanently delete it on the server, which also removes
        // the video file(s) from Storage.
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
  const isPlanningPrompt = false
  const canSubmit = promptText.trim().length > 0 && framesSatisfied && !hasUploadingFiles && !isSubmitting && !isPlanningPrompt
  const blockedReason = useMemo(() => {
    if (isSubmitting || isPlanningPrompt) return null
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
  }, [isSubmitting, isPlanningPrompt, hasUploadingFiles, readyStartFrame, readyEndFrame, promptText, isTextToVideo])
  const [composerError, setComposerError] = useState<string | null>(null)
  const [isPromptMenuOpen, setIsPromptMenuOpen] = useState(false)
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'wan-i2v'
    return window.localStorage.getItem('ui:preferred-model') ?? 'wan-i2v'
  })
  const [narratorMode, setNarratorMode] = useState<'idle' | 'input'>('idle')
  const [narratorScript, setNarratorScript] = useState('')
  const [styleMode, setStyleMode] = useState<'idle' | 'input'>('idle')
  const [selectedStyles, setSelectedStyles] = useState<StyleSelection>(emptyStyleSelection)
  const selectedStyleCount = useMemo(() => countSelectedStyles(selectedStyles), [selectedStyles])
  const toggleStyle = (kind: keyof StyleSelection, id: string) => {
    setSelectedStyles((prev) => {
      const has = prev[kind].includes(id)
      return {
        ...prev,
        [kind]: has ? prev[kind].filter((x) => x !== id) : [...prev[kind], id],
      }
    })
  }

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


  // Cost preview / confirm dialog state
  const [confirmCostOpen, setConfirmCostOpen] = useState(false)
  const [dontAskCost, setDontAskCost] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.sessionStorage.getItem('ui:skip-cost-confirm') === '1'
  })
  const submitConfirmedRef = useRef(false)
  const costEstimate = useMemo(
    () => estimateGenerationCost(selectedModel, durationSeconds),
    [selectedModel, durationSeconds],
  )
  // Local RTX models only support 5/10/15s clips — clamp if a longer duration
  // was selected before switching to a local model.
  useEffect(() => {
    if (selectedModel?.providerKey === 'local' && durationSeconds > 15) {
      setDurationSeconds(15)
    }
  }, [selectedModel?.providerKey, durationSeconds])





  const runEnhancePrompt = async (
    options: { mode: 'silent' | 'narrated' | 'styles'; narratorScript?: string; styleHints?: string },
  ) => {
    if (isEnhancingPrompt || isSubmitting) return
    const current = promptText.trim()
    if (options.mode === 'silent' && !current) {
      setComposerError('Type a short idea first, then choose No narrator.')
      return
    }
    if (options.mode === 'styles') {
      if (!current) {
        setComposerError('Type a short idea first, then pick styles.')
        return
      }
      if (!(options.styleHints ?? '').trim()) {
        setComposerError('Pick at least one style to optimize the prompt.')
        return
      }
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
      // 'styles' optimization is a silent rewrite that incorporates style hints.
      const invokeMode = options.mode === 'styles' ? 'silent' : options.mode
      const { data, error } = await supabase.functions.invoke('enhance-prompt', {
        body: {
          prompt: current,
          imageUrls,
          mode: invokeMode,
          narratorScript: options.narratorScript ?? '',
          styleHints: options.styleHints ?? '',
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
      setStyleMode('idle')
      setSelectedStyles(emptyStyleSelection())
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
  const { libraryItems, finalizedItems, draftItems } = useMemo<{
    libraryItems: JobDetail[]
    finalizedItems: JobDetail[]
    draftItems: JobDetail[]
  }>(() => {
    const liveById = new Map<string, JobDetail>()
    for (const j of generatedVideos) liveById.set(j.id, j)

    const sortDesc = (a: JobDetail, b: JobDetail) => {
      const ta = new Date(a.updated_at ?? a.created_at ?? 0).getTime()
      const tb = new Date(b.updated_at ?? b.created_at ?? 0).getTime()
      return tb - ta
    }

    const finals: JobDetail[] = mergedEntries
      .filter((j) => approvedIds.has(j.id))
      .map((j) => liveById.get(j.id) ?? j)
      .sort(sortDesc)

    const drafts = [...draftEntries].sort(sortDesc)

    return {
      libraryItems: [...finals, ...drafts],
      finalizedItems: finals,
      draftItems: drafts,
    }
  }, [mergedEntries, draftEntries, generatedVideos, approvedIds])

  // ----- Auto-snapshot the active workspace into a Draft project -----
  // Any time the workspace has at least one live clip/image, mirror it to a
  // Draft entry + per-draft snapshot so the chain survives refresh & Start
  // Over. Final Film success clears the draft (it becomes a Final video).
  //
  // Ownership model: each clip / image is permanently stamped to exactly one
  // draft via jobDraftMap / imageDraftMap at creation time. We rebuild every
  // draft's snapshot by GROUPING clips by their owning draft id — never by
  // "is it currently live in the workspace". This is what guarantees a clip
  // can never leak into a different draft project.
  useEffect(() => {
    if (!userId) return
    // Clips/images already claimed by a finalized Final Film project must not
    // also live inside a draft (the draft graduated into a Final video).
    const finalClaimedJobs = new Set<string>()
    for (const clips of Object.values(projectSourceJobs)) {
      for (const c of clips) finalClaimedJobs.add(c.id)
    }
    const finalClaimedImages = new Set<string>()
    for (const imgs of Object.values(projectSourceImages)) {
      for (const i of imgs) finalClaimedImages.add(i.id)
    }

    // Group every mapped clip / image by its owning draft id. The DURABLE
    // server `draft_group_id` wins: it survives refresh / cross-device, so all
    // clips made in one session always regroup into ONE draft. The local
    // jobDraftMap is only a fallback for legacy rows that predate the column.
    const clipsByDraft = new Map<string, JobDetail[]>()
    for (const v of generatedVideos) {
      if (v.id.startsWith('merged-')) continue
      if (finalClaimedJobs.has(v.id)) continue
      const did = v.draft_group_id ? draftIdForGroupUuid(v.draft_group_id) : jobDraftMap[v.id]
      if (!did || deletedDraftIds.has(did)) continue
      const arr = clipsByDraft.get(did) ?? []
      arr.push(v)
      clipsByDraft.set(did, arr)
    }
    // Film covers are owned by a project scope (coverImages), NEVER by a
    // draft. They must never be grouped into a draft snapshot.
    const coverImageIds = new Set<string>()
    for (const ci of Object.values(coverImages)) coverImageIds.add(ci.id)
    const imagesByDraft = new Map<string, UserImageItem[]>()
    for (const img of userImages) {
      if (finalClaimedImages.has(img.id)) continue
      if (coverImageIds.has(img.id)) continue
      const did = img.draft_group_id ? draftIdForGroupUuid(img.draft_group_id) : imageDraftMap[img.id]
      if (!did || deletedDraftIds.has(did)) continue
      const arr = imagesByDraft.get(did) ?? []
      arr.push(img)
      imagesByDraft.set(did, arr)
    }


    const involvedDraftIds = new Set<string>([...clipsByDraft.keys(), ...imagesByDraft.keys()])
    if (involvedDraftIds.size === 0) return

    // Rebuild draft clip snapshots. We MERGE with the prior snapshot only
    // within the SAME draft: a clip that momentarily lost its storage_path
    // (provider hiccup / transient poll error) keeps its last-known-good copy
    // so a draft never silently loses its video content.
    setDraftSourceJobs((prev) => {
      let changed = false
      const next = { ...prev }
      for (const did of involvedDraftIds) {
        const live = clipsByDraft.get(did) ?? []
        const cur = prev[did] ?? []
        const byId = new Map(cur.map((c) => [c.id, c] as const))
        const finalList = live.map((c) => {
          const hasPath = !!c.video?.storage_path
          const existing = byId.get(c.id)
          if (!hasPath && existing?.video?.storage_path) return existing
          return c
        })
        const sameLen = cur.length === finalList.length
        const sameIds = sameLen && cur.every((c, i) => c.id === finalList[i].id && (c.video?.storage_path ?? null) === (finalList[i].video?.storage_path ?? null))
        if (!sameIds) { next[did] = finalList; changed = true }
      }
      if (!changed) return prev
      persistDraftSourceJobs(next)
      return next
    })
    setDraftSourceImages((prev) => {
      let changed = false
      const next = { ...prev }
      for (const did of involvedDraftIds) {
        const live = imagesByDraft.get(did) ?? []
        const cur = prev[did] ?? []
        const sameLen = cur.length === live.length
        const sameIds = sameLen && cur.every((c, i) => c.id === live[i].id)
        if (!sameIds) { next[did] = live; changed = true }
      }
      if (!changed) return prev
      persistDraftSourceImages(next)
      return next
    })

    // Upsert one Library card per involved draft.
    setDraftEntries((prev) => {
      const nowIso = new Date().toISOString()
      let changed = false
      const byId = new Map(prev.map((d) => [d.id, d] as const))
      for (const did of involvedDraftIds) {
        const liveClips = clipsByDraft.get(did) ?? []
        const liveImages = imagesByDraft.get(did) ?? []
        if (liveClips.length === 0 && liveImages.length === 0) {
          // Draft became empty — drop its card.
          if (byId.has(did)) { byId.delete(did); changed = true }
          continue
        }
        const firstClip = liveClips[liveClips.length - 1] // oldest = chain start
        const firstImg = liveImages[liveImages.length - 1]
        const prompt = firstClip?.input_prompt ?? 'Draft project'
        const ratio = normalizeRatio(firstClip?.video?.aspect_ratio ?? null)
          ?? normalizeRatio(firstClip?.requested_aspect_ratio ?? null)
          ?? null
        const thumb = firstClip?.video?.thumbnail_url ?? firstImg?.storage_path ?? null
        const stubVideo: JobDetail['video'] = firstClip?.video
          ? { ...firstClip.video }
          : { id: did, storage_path: firstImg?.storage_path ?? '', thumbnail_url: thumb, aspect_ratio: ratio, duration: null }
        const existing = byId.get(did)
        const entry: JobDetail = {
          id: did,
          input_prompt: prompt,
          status: 'draft',
          provider_key: existing?.provider_key ?? null,
          model_key: existing?.model_key ?? null,
          first_frame_url: null,
          last_frame_url: null,
          requested_duration: null,
          requested_aspect_ratio: ratio,
          created_at: existing?.created_at ?? nowIso,
          updated_at: nowIso,
          video: stubVideo,
        }
        byId.set(did, entry)
        changed = true
      }
      if (!changed) return prev
      // Preserve previous relative order; new drafts go to the front.
      const seen = new Set<string>()
      const ordered: JobDetail[] = []
      for (const d of prev) {
        const cur = byId.get(d.id)
        if (cur && !seen.has(d.id)) { ordered.push(cur); seen.add(d.id) }
      }
      for (const did of involvedDraftIds) {
        const cur = byId.get(did)
        if (cur && !seen.has(did)) { ordered.unshift(cur); seen.add(did) }
      }
      persistDraftEntries(ordered)
      return ordered
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, generatedVideos, userImages, jobDraftMap, imageDraftMap, projectSourceJobs, projectSourceImages, deletedDraftIds, coverImages])




  // ----- Backfill historical drafts -----
  // Any completed clip / uploaded image that has no draft ownership yet AND is
  // not part of a Final Film becomes its OWN isolated draft: we stamp it into
  // jobDraftMap / imageDraftMap with a deterministic per-item draft id. The
  // grouping effect above then builds the snapshot + Library card from that
  // mapping. Deterministic ids keep reruns idempotent; the `deletedDraftIds`
  // tombstone prevents user-deleted drafts from coming back.
  useEffect(() => {
    if (!userId) return
    if (generatedVideos.length === 0 && userImages.length === 0) return

    const claimedJobIds = new Set<string>()
    for (const clips of Object.values(projectSourceJobs)) {
      for (const c of clips) claimedJobIds.add(c.id)
    }
    for (const id of Object.keys(librarySavedJobs)) claimedJobIds.add(id)
    for (const e of mergedEntries) claimedJobIds.add(e.id)

    const claimedImageIds = new Set<string>()
    for (const imgs of Object.values(projectSourceImages)) {
      for (const i of imgs) claimedImageIds.add(i.id)
    }

    const jobStamps: Record<string, string> = {}
    for (const job of generatedVideos) {
      if (job.draft_group_id) continue // durably owned by a server draft group
      if (jobDraftMap[job.id]) continue // already owned by a draft
      if (claimedJobIds.has(job.id)) continue
      if (job.id.startsWith('merged-')) continue
      if (deletedDraftIds.has(job.id)) continue
      if (normalizeStatus(job.status) !== 'completed') continue
      if (!job.video?.storage_path) continue
      const draftId = `draft-orphan-${job.id}`
      if (deletedDraftIds.has(draftId)) continue
      jobStamps[job.id] = draftId
    }

    // Film covers belong to a project scope, not a draft — never give a
    // cover its own orphan draft.
    const coverImageIds = new Set<string>()
    for (const ci of Object.values(coverImages)) coverImageIds.add(ci.id)
    const imageStamps: Record<string, string> = {}
    for (const img of userImages) {
      if (img.draft_group_id) continue // durably owned by a server draft group
      if (imageDraftMap[img.id]) continue
      if (claimedImageIds.has(img.id)) continue
      if (coverImageIds.has(img.id)) continue
      if (deletedDraftIds.has(img.id)) continue
      const draftId = `draft-orphan-img-${img.id}`
      if (deletedDraftIds.has(draftId)) continue
      imageStamps[img.id] = draftId
    }

    if (Object.keys(jobStamps).length > 0) {
      setJobDraftMap((prev) => {
        let changed = false
        const next = { ...prev }
        for (const [id, did] of Object.entries(jobStamps)) {
          if (next[id] !== did) { next[id] = did; changed = true }
        }
        if (!changed) return prev
        persistJobDraftMap(next)
        return next
      })
    }
    if (Object.keys(imageStamps).length > 0) {
      setImageDraftMap((prev) => {
        let changed = false
        const next = { ...prev }
        for (const [id, did] of Object.entries(imageStamps)) {
          if (next[id] !== did) { next[id] = did; changed = true }
        }
        if (!changed) return prev
        persistImageDraftMap(next)
        return next
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, generatedVideos, userImages, mergedEntries, librarySavedJobs, projectSourceJobs, projectSourceImages, jobDraftMap, imageDraftMap, deletedDraftIds, coverImages])


  // ----- One-time legacy regroup -----
  // Older clips/images grouped only in localStorage (jobDraftMap as
  // `draft-<uuid>`) but with no durable server `draft_group_id` get stamped
  // server-side once, so the grouping that exists now becomes permanent and
  // never fragments on future refreshes / other devices.
  const legacyRegroupedRef = useRef(false)
  useEffect(() => {
    if (!userId) return
    if (legacyRegroupedRef.current) return
    if (generatedVideos.length === 0 && userImages.length === 0) return
    legacyRegroupedRef.current = true

    const groups = new Map<string, { jobs: string[]; images: string[] }>()
    const ensure = (uuid: string) => {
      let g = groups.get(uuid)
      if (!g) { g = { jobs: [], images: [] }; groups.set(uuid, g) }
      return g
    }
    for (const v of generatedVideos) {
      if (v.draft_group_id) continue
      const uuid = draftGroupUuid(jobDraftMap[v.id])
      if (uuid) ensure(uuid).jobs.push(v.id)
    }
    for (const img of userImages) {
      if (img.draft_group_id) continue
      const uuid = draftGroupUuid(imageDraftMap[img.id])
      if (uuid) ensure(uuid).images.push(img.id)
    }
    if (groups.size === 0) return

    void (async () => {
      for (const [uuid, g] of groups) {
        if (g.jobs.length === 0 && g.images.length === 0) continue
        try {
          await supabase.rpc('generator_set_draft_group', {
            _user_id: userId,
            _group_id: uuid,
            _job_ids: g.jobs,
            _image_ids: g.images,
          })
        } catch (err) {
          console.warn('[legacy regroup] failed for group', uuid, err)
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, generatedVideos, userImages, jobDraftMap, imageDraftMap])




  // One-time dedupe: older builds could create both an active `draft-<uuid>`
  // and a `draft-orphan-<jobId>` entry for the same underlying clip/image.
  // On mount, drop any orphan twin whose source id is already owned by
  // another draft, and tombstone it so the backfill effect never resurrects
  // it.
  const dedupedDraftsRef = useRef(false)
  useEffect(() => {
    if (!userId) return
    if (dedupedDraftsRef.current) return
    if (draftEntries.length === 0) return
    dedupedDraftsRef.current = true

    const sourceOwners = new Map<string, string>()
    for (const [draftId, clips] of Object.entries(draftSourceJobs)) {
      if (draftId.startsWith('draft-orphan-')) continue
      for (const c of clips) {
        if (!sourceOwners.has(c.id)) sourceOwners.set(c.id, draftId)
      }
    }
    for (const [draftId, imgs] of Object.entries(draftSourceImages)) {
      if (draftId.startsWith('draft-orphan-')) continue
      for (const i of imgs) {
        if (!sourceOwners.has(i.id)) sourceOwners.set(i.id, draftId)
      }
    }

    const toRemove = new Set<string>()
    for (const [draftId, clips] of Object.entries(draftSourceJobs)) {
      if (!draftId.startsWith('draft-orphan-')) continue
      if (clips.some((c) => sourceOwners.has(c.id))) toRemove.add(draftId)
    }
    for (const [draftId, imgs] of Object.entries(draftSourceImages)) {
      if (!draftId.startsWith('draft-orphan-')) continue
      if (imgs.some((i) => sourceOwners.has(i.id))) toRemove.add(draftId)
    }
    // Per user requirement: drafts are never auto-removed. Duplicate
    // detection is preserved for diagnostics but no draft is deleted here.
    if (toRemove.size === 0) return
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, draftEntries, draftSourceJobs, draftSourceImages])

  // One-time cleanup of legacy pollution: earlier builds could turn a Film
  // Cover image into its own `draft-orphan-img-*` draft. Such a draft has a
  // single image whose id is a known cover. Remove those ghost drafts, strip
  // their ownership stamp, and tombstone them so they never come back.
  const coverGhostCleanedRef = useRef(false)
  useEffect(() => {
    if (!userId) return
    if (coverGhostCleanedRef.current) return
    if (Object.keys(coverImages).length === 0) return
    coverGhostCleanedRef.current = true

    const coverIds = new Set<string>()
    for (const ci of Object.values(coverImages)) coverIds.add(ci.id)

    const ghostDraftIds = new Set<string>()
    for (const [draftId, imgs] of Object.entries(draftSourceImages)) {
      const onlyCovers = imgs.length > 0 && imgs.every((i) => coverIds.has(i.id))
      const noClips = (draftSourceJobs[draftId] ?? []).length === 0
      if (onlyCovers && noClips) ghostDraftIds.add(draftId)
    }
    // Also catch deterministic orphan ids built from cover image ids even if
    // the snapshot wasn't written yet.
    for (const id of coverIds) ghostDraftIds.add(`draft-orphan-img-${id}`)

    if (ghostDraftIds.size === 0) return

    setDraftEntries((prev) => {
      const next = prev.filter((d) => !ghostDraftIds.has(d.id))
      if (next.length === prev.length) return prev
      persistDraftEntries(next)
      return next
    })
    setDraftSourceImages((prev) => {
      const next = { ...prev }
      let changed = false
      for (const id of ghostDraftIds) { if (id in next) { delete next[id]; changed = true } }
      if (!changed) return prev
      persistDraftSourceImages(next)
      return next
    })
    setImageDraftMap((prev) => {
      const next = { ...prev }
      let changed = false
      for (const [imgId, did] of Object.entries(prev)) {
        if (coverIds.has(imgId) || ghostDraftIds.has(did)) { delete next[imgId]; changed = true }
      }
      if (!changed) return prev
      persistImageDraftMap(next)
      return next
    })
    setDeletedDraftIds((prev) => {
      const next = new Set(prev)
      for (const id of ghostDraftIds) next.add(id)
      persistDeletedDraftIds(next)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, coverImages, draftSourceImages, draftSourceJobs])



  // Backfill `projectSourceJobs` / `projectSourceImages` for legacy Final
  // Films that were merged before the snapshot system existed. Without this,
  // opening such a project shows a blank "0:00" card (the merged film itself)
  // instead of its real source clips. Runs once per project id and writes
  // `[]` when no traceable sources exist so the heuristic doesn't loop.
  useEffect(() => {
    if (!userId) return
    const projects: Array<{ id: string; created_at: string }> = []
    for (const m of mergedEntries) projects.push({ id: m.id, created_at: m.created_at })
    for (const j of Object.values(librarySavedJobs)) projects.push({ id: j.id, created_at: j.created_at })
    if (projects.length === 0) return

    const missing = projects.filter((p) => !(p.id in projectSourceJobs))
    if (missing.length === 0) return

    const claimedJobs = new Set<string>()
    for (const clips of Object.values(projectSourceJobs)) {
      for (const c of clips) claimedJobs.add(c.id)
    }
    const claimedImgs = new Set<string>()
    for (const imgs of Object.values(projectSourceImages)) {
      for (const i of imgs) claimedImgs.add(i.id)
    }

    const nextJobs = { ...projectSourceJobs }
    const nextImgs = { ...projectSourceImages }
    let jobsChanged = false
    let imgsChanged = false

    // Items owned by ANY draft (via ownership maps or live draft snapshots)
    // must never be claimed by a legacy Final Film backfill — that is exactly
    // how a draft's image/clip leaks into another project. Only truly loose,
    // unowned legacy items are eligible.
    const draftOwnedJobIds = new Set<string>(Object.keys(jobDraftMap))
    for (const clips of Object.values(draftSourceJobs)) {
      for (const c of clips) draftOwnedJobIds.add(c.id)
    }
    const draftOwnedImageIds = new Set<string>(Object.keys(imageDraftMap))
    for (const imgs of Object.values(draftSourceImages)) {
      for (const i of imgs) draftOwnedImageIds.add(i.id)
    }
    // Film covers belong to a specific project scope and must never be pulled
    // into another project's legacy source-image backfill.
    for (const ci of Object.values(coverImages)) draftOwnedImageIds.add(ci.id)

    for (const p of missing) {
      const cutoff = new Date(p.created_at).getTime()
      const sourceClips = [...generatedVideos]
        .filter(
          (v) =>
            v.id !== p.id &&
            !v.id.startsWith('merged-') &&
            !claimedJobs.has(v.id) &&
            !draftOwnedJobIds.has(v.id) &&
            normalizeStatus(v.status) === 'completed' &&
            !!v.video?.storage_path &&
            new Date(v.created_at).getTime() <= cutoff,
        )
        .sort((l, r) => new Date(l.created_at).getTime() - new Date(r.created_at).getTime())
      nextJobs[p.id] = sourceClips
      jobsChanged = true
      for (const c of sourceClips) claimedJobs.add(c.id)

      if (!(p.id in projectSourceImages)) {
        const sourceImgs = [...userImages]
          .filter(
            (i) =>
              !claimedImgs.has(i.id) &&
              !draftOwnedImageIds.has(i.id) &&
              !!i.storage_path &&
              new Date(i.created_at).getTime() <= cutoff,
          )
          .sort((l, r) => new Date(l.created_at).getTime() - new Date(r.created_at).getTime())
        nextImgs[p.id] = sourceImgs
        imgsChanged = true
        for (const i of sourceImgs) claimedImgs.add(i.id)
      }
    }

    if (jobsChanged) {
      setProjectSourceJobs(nextJobs)
      persistProjectSourceJobs(nextJobs)
    }
    if (imgsChanged) {
      setProjectSourceImages(nextImgs)
      persistProjectSourceImages(nextImgs)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, mergedEntries, librarySavedJobs, generatedVideos, userImages, jobDraftMap, imageDraftMap, draftSourceJobs, draftSourceImages, coverImages])




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
    // Viewing a saved Library project: lock to that project's ratio.
    if (selectedProjectId) {
      const proj = [...mergedEntries, ...generatedVideos, ...draftEntries, ...Object.values(librarySavedJobs)]
        .find((v) => v.id === selectedProjectId)
      if (proj) return getRatioFor(proj)
    }
    // Project ratio is locked the moment the user submits the first job —
    // honor it immediately even before the clip materializes in workspace.
    if (lockedProjectRatio) return lockedProjectRatio
    // Active working chain only: ignore clips already snapshotted into a
    // Library project and clips/images hidden from the workspace.
    const claimedJobIds = new Set<string>()
    for (const clips of Object.values(projectSourceJobs)) {
      for (const c of clips) claimedJobIds.add(c.id)
    }
    const liveVideos = generatedVideos.filter(
      (v) => activeJobIds.has(v.id) && !claimedJobIds.has(v.id) && !workspaceHiddenJobIds.has(v.id),
    )
    if (liveVideos.length > 0) {
      // newest-first; the oldest (first in chain) is last.
      const first = liveVideos[liveVideos.length - 1]
      return getRatioFor(first)
    }
    const claimedImageIds = new Set<string>()
    for (const imgs of Object.values(projectSourceImages)) {
      for (const i of imgs) claimedImageIds.add(i.id)
    }
    // Film covers are not generation sources and must not drive the chain ratio.
    for (const ci of Object.values(coverImages)) claimedImageIds.add(ci.id)
    const liveImages = userImages.filter(
      (i) => activeImageIds.has(i.id) && !claimedImageIds.has(i.id) && !workspaceHiddenImageIds.has(i.id),
    )
    if (liveImages.length > 0) {
      const firstImg = liveImages[liveImages.length - 1]
      const w = firstImg.width ?? 0
      const h = firstImg.height ?? 0
      if (w > 0 && h > 0) {
        const r = w / h
        return r > 1.2 ? '16:9' : r < 0.85 ? '9:16' : '1:1'
      }
    }
    return null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedVideos, userImages, selectedProjectId, projectSourceJobs, projectSourceImages, workspaceHiddenJobIds, workspaceHiddenImageIds, mergedEntries, draftEntries, librarySavedJobs, lockedProjectRatio, activeJobIds, activeImageIds, coverImages])

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
      const isDraft = selectedProjectId.startsWith('draft-')
      const snapshot = projectSourceJobs[selectedProjectId] ?? draftSourceJobs[selectedProjectId] ?? []
      const liveById = new Map(generatedVideos.map((v) => [v.id, v]))
      // Hard guard: the merged film itself must never appear inside its own
      // Working-clips list. For finalized projects we also drop clips without a
      // playable storage_path (blank 0:00 cards). For DRAFTS we keep every
      // source card even if its video isn't ready yet — the user must always be
      // able to open a draft and see the cards it's composed of; the card UI
      // shows a quiet placeholder for not-yet-playable clips.
      const sanitize = (jobs: JobDetail[]): JobDetail[] =>
        jobs.filter(
          (j) =>
            j.id !== selectedProjectId &&
            !j.id.startsWith('merged-') &&
            (isDraft || !!j.video?.storage_path),
        )
      if (snapshot.length > 0) {
        return sanitize(snapshot.map((s) => liveById.get(s.id) ?? s))
      }
      // Single-clip Library entry: the selected id is the original job id
      // (no "merged-" prefix and no snapshot). Show only that one clip.
      if (!selectedProjectId.startsWith('merged-') && !selectedProjectId.startsWith('draft-')) {
        const savedJob = librarySavedJobs[selectedProjectId]
        const live = liveById.get(selectedProjectId)
        const pick = live ?? savedJob
        return pick && pick.video?.storage_path ? [pick] : []
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
          v.id !== selectedProjectId &&
          !v.id.startsWith('merged-') &&
          !claimed.has(v.id) &&
          !!v.video?.storage_path &&
          new Date(v.created_at).getTime() <= cutoff,
        )
        .sort((l, r) => new Date(l.created_at).getTime() - new Date(r.created_at).getTime())
    }
    // Backstop: any clip already snapshotted into a Library project OR into
    // another (non-active) draft must never appear loose in the default
    // workspace — that was the root cause of cross-draft clips leaking into
    // Final Film. The active draft's own snapshot mirrors the live workspace,
    // so it must NOT be treated as "claimed by another project".
    const claimedByProjects = new Set<string>()
    for (const clips of Object.values(projectSourceJobs)) {
      for (const c of clips) claimedByProjects.add(c.id)
    }
    for (const [did, clips] of Object.entries(draftSourceJobs)) {
      if (did === activeDraftId) continue
      for (const c of clips) claimedByProjects.add(c.id)
    }
    const chronoAsc = [...generatedVideos]
      .filter((v) => activeJobIds.has(v.id) && !workspaceHiddenJobIds.has(v.id) && !claimedByProjects.has(v.id))
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
  }, [generatedVideos, manualOrder, workspaceHiddenJobIds, selectedProjectId, projectSourceJobs, draftSourceJobs, activeDraftId, mergedEntries, librarySavedJobs, activeJobIds])

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
  // Active scope for the film cover: a finalized project takes priority, then
  // the active draft, otherwise the bare workspace.
  const coverScopeKey: string | null = selectedProjectId ?? activeDraftId ?? null
  const currentCover: UserImageItem | null = coverScopeKey ? (coverImages[coverScopeKey] ?? null) : null
  // All cover image ids across every scope — used to hide them from the normal
  // clip list so a cover never double-renders as a generation source.
  const allCoverImageIds = useMemo(() => {
    const s = new Set<string>()
    for (const img of Object.values(coverImages)) s.add(img.id)
    return s
  }, [coverImages])

  const visibleUserImages = useMemo<UserImageItem[]>(() => {
    if (selectedProjectId) {
      const snapshot = projectSourceImages[selectedProjectId] ?? draftSourceImages[selectedProjectId] ?? []
      const liveById = new Map(userImages.map((i) => [i.id, i]))
      if (snapshot.length > 0) return snapshot.map((s) => liveById.get(s.id) ?? s).filter((i) => !allCoverImageIds.has(i.id))
      // Single-clip Library entries never have image sources.
      if (!selectedProjectId.startsWith('merged-') && !selectedProjectId.startsWith('draft-')) return []
    }
    const claimedByProjects = new Set<string>()
    for (const imgs of Object.values(projectSourceImages)) {
      for (const i of imgs) claimedByProjects.add(i.id)
    }
    for (const [did, imgs] of Object.entries(draftSourceImages)) {
      if (did === activeDraftId) continue
      for (const i of imgs) claimedByProjects.add(i.id)
    }
    return userImages.filter((i) => activeImageIds.has(i.id) && !workspaceHiddenImageIds.has(i.id) && !claimedByProjects.has(i.id) && !allCoverImageIds.has(i.id))
  }, [userImages, selectedProjectId, projectSourceImages, draftSourceImages, activeDraftId, workspaceHiddenImageIds, allCoverImageIds, activeImageIds])


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

  // Approximate total length of the Final Film, used to place music / voiceover
  // on the video timeline. Falls back to sensible per-clip defaults when a
  // clip's exact duration isn't known yet.
  const mergedDurationSec = useMemo(() => {
    let total = 0
    for (const c of playableSequenceClips) {
      if (c.kind === 'image') {
        total += Math.max(1, Math.min(15, c.image.still_duration_seconds || 3))
      } else {
        const d = c.job.video?.duration ?? c.job.requested_duration ?? null
        total += d && Number.isFinite(d) && d > 0 ? d : 8
      }
    }
    return Math.max(1, Math.round(total))
  }, [playableSequenceClips])



  const previewItem = useMemo<PreviewItem | null>(() => {
    // Highest priority: the transient Final Film output (not a card).
    if (lastMergedPreview) {
      const synthetic: JobDetail = {
        id: '__final_film_preview__',
        status: 'completed',
        input_prompt: lastMergedPreview.clipCount === 1
          ? 'Final clip — soundtrack applied'
          : `Final merged video — ${lastMergedPreview.clipCount} clips`,
        provider_key: 'merged',
        model_key: 'browser-canvas',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        video: {
          id: '__final_film_preview__',
          storage_path: lastMergedPreview.url,
          thumbnail_url: null,
          aspect_ratio: lastMergedPreview.ratio,
          duration: null,
        },
      }
      return { kind: 'video', job: synthetic }
    }
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
  }, [lastMergedPreview, displayedClips, previewVideoId, previewDismissed, selectedProjectId, visibleVideos, playableSequenceClips])

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

  // Non-destructive restore: on mount, re-hydrate `generatedVideos` and
  // `userImages` from the backend so the Pending column and source images
  // survive a page refresh. Items only ever leave memory when the user
  // explicitly deletes them via the Trash buttons.
  const hydrationRanRef = useRef<string | null>(null)
  useEffect(() => {
    if (!userId) return
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
            .select('id, storage_path, created_at, still_duration_seconds, width, height, category')
            .eq('user_id', userId)
            .is('deleted_at', null)
            // Product photos live only in the Storage > Product Photos tab.
            // They must never leak into the workspace/drafts/library.
            .or('category.is.null,category.neq.product'),
        ])
        if (cancelled) return

        const hiddenJobs = workspaceHiddenJobIds
        const visibleSummaries = summaries.filter((s) => !hiddenJobs.has(s.id))
        const hydrated = await hydrateJobs(visibleSummaries)
        if (cancelled) return
        if (hydrated.length > 0) {
          setGeneratedVideos((current) => hydrated.reduce((acc, j) => mergeJob(acc, j), current))
        }

        const imgRows = (imgRowsRes.data ?? []) as UserImageItem[]
        const visibleImages = imgRows.filter(
          (r) => !workspaceHiddenImageIds.has(r.id) && (r.category ?? 'general') !== 'product',
        )
        if (visibleImages.length > 0) {
          setUserImages((current) => {
            const known = new Set(current.map((i) => i.id))
            const merged = [...current]
            for (const img of visibleImages) if (!known.has(img.id)) merged.push(img)
            return merged.sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            )
          })
        }
      } catch (err) {
        console.error('Workspace restore failed', err)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

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
      const imageGroupId = ensureActiveDraftGroupId() ?? null
      const { data: row, error: insErr } = await supabase
        .from('generator_user_images')
        .insert({
          user_id: userId,
          storage_path: publicUrl,
          size_bytes: file.size,
          mime_type: file.type,
          draft_group_id: imageGroupId,
        })
        .select('id, storage_path, created_at, still_duration_seconds, width, height, draft_group_id')
        .single()
      if (insErr) throw insErr
      setUserImages((prev) => [row as UserImageItem, ...prev])
      markNewImage((row as UserImageItem).id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.'
      setVideoColumnMessage(`Image upload failed: ${msg}`)
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handlePickProductPhoto = () => {
    if (isUploadingProductPhoto) return
    productPhotoInputRef.current?.click()
  }

  const handleProductPhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !userId) return
    setProductUploadError(null)
    if (!file.type.startsWith('image/')) {
      setProductUploadError('Please choose an image file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setProductUploadError('Image must be smaller than 10 MB.')
      return
    }
    setIsUploadingProductPhoto(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
      const path = `${userId}/${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage
        .from(USER_IMAGES_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })
      if (up.error) throw up.error
      const { data: pub } = supabase.storage.from(USER_IMAGES_BUCKET).getPublicUrl(path)
      const publicUrl = pub.publicUrl
      const trimmedName = productName.trim().slice(0, 100)
      const { data: row, error: insErr } = await supabase
        .from('generator_user_images')
        .insert({
          user_id: userId,
          storage_path: publicUrl,
          size_bytes: file.size,
          mime_type: file.type,
          category: 'product',
          title: trimmedName || null,
        })
        .select('id, storage_path, created_at, still_duration_seconds, width, height, category, title')
        .single()
      if (insErr) throw insErr
      setArchiveProductImages((prev) => [row as UserImageItem, ...prev])
      setProductName('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.'
      setProductUploadError(`Upload failed: ${msg}`)
    } finally {
      setIsUploadingProductPhoto(false)
    }
  }

  const startRenameProduct = (img: UserImageItem) => {
    setRenamingProductId(img.id)
    setRenameProductValue(img.title ?? '')
  }

  const cancelRenameProduct = () => {
    setRenamingProductId(null)
    setRenameProductValue('')
  }

  const renameProductPhoto = async (imageId: string) => {
    if (!userId) return
    const nextTitle = renameProductValue.trim().slice(0, 100) || null
    try {
      const { error } = await supabase
        .from('generator_user_images')
        .update({ title: nextTitle })
        .eq('id', imageId)
        .eq('user_id', userId)
      if (error) throw error
      setArchiveProductImages((prev) =>
        prev.map((i) => (i.id === imageId ? { ...i, title: nextTitle } : i)),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not rename.'
      setProductUploadError(`Rename failed: ${msg}`)
    } finally {
      cancelRenameProduct()
    }
  }

  const handleDeleteUserImage = async (imageId: string) => {
    unmarkActiveImages([imageId])
    if (!userId) return
    const prev = userImages
    setUserImages((curr) => curr.filter((i) => i.id !== imageId))
    setArchiveImages((curr) => curr.filter((i) => i.id !== imageId))
    setArchiveProductImages((curr) => curr.filter((i) => i.id !== imageId))
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
    // Mirror the job-delete cleanup for drafts: prune image from every draft
    // snapshot, drop any draft entry that becomes empty, and tombstone it so
    // the orphan-backfill effect cannot resurrect a ghost "1 clip" card.
    {
      const nextDraftImgs: Record<string, UserImageItem[]> = {}
      let imgsChanged = false
      for (const [did, imgs] of Object.entries(draftSourceImages)) {
        const filtered = imgs.filter((i) => i.id !== imageId)
        if (filtered.length !== imgs.length) imgsChanged = true
        nextDraftImgs[did] = filtered
      }
      if (imgsChanged) {
        setDraftSourceImages(nextDraftImgs)
        persistDraftSourceImages(nextDraftImgs)
      }

      const emptyDraftIds = new Set<string>()
      for (const did of new Set([
        ...Object.keys(nextDraftImgs),
        ...Object.keys(draftSourceJobs),
      ])) {
        const clipsLeft = (draftSourceJobs[did] ?? []).length
        const imgsLeft = (nextDraftImgs[did] ?? draftSourceImages[did] ?? []).length
        if (clipsLeft === 0 && imgsLeft === 0) emptyDraftIds.add(did)
      }
      if (emptyDraftIds.size > 0) {
        setDraftEntries((p) => {
          const next = p.filter((d) => !emptyDraftIds.has(d.id))
          if (next.length === p.length) return p
          persistDraftEntries(next)
          return next
        })
        // Tombstone so the backfill effect doesn't recreate the same draft.
        const tombstones = new Set<string>([...deletedDraftIds, ...emptyDraftIds])
        // Also tombstone the inferred orphan-image id form so a re-uploaded
        // image with a new id is the only thing that can produce a new card.
        tombstones.add(`draft-orphan-img-${imageId}`)
        setDeletedDraftIds(tombstones)
        if (deletedDraftIdsKey) {
          try { window.localStorage.setItem(deletedDraftIdsKey, JSON.stringify(Array.from(tombstones))) } catch { /* ignore */ }
        }
        if (activeDraftId && emptyDraftIds.has(activeDraftId)) {
          setActiveDraftId(null)
          persistActiveDraftId(null)
        }
        if (selectedProjectId && emptyDraftIds.has(selectedProjectId)) {
          setSelectedProjectId(null)
        }
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
    const MAX_BYTES = 1024 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      setVideoColumnMessage('Video is larger than 1GB. Please choose a smaller file.')
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
      // Stamp it into the active draft (like generated clips) so it shows as a
      // working-clip card instead of being filtered out as an orphan draft.
      setGeneratedVideos((current) => mergeJob(current, detail))
      markNewClip(detail.id)
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
    const activeJobs = generatedVideos.filter((job) => isJobAwaitingResolution(job))

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
        activeJobs.map(async (job) => ({ jobId: job.id, detail: await jobOrchestratorGateway.getJob(job.id) })),
      )
      // Protect drafts: any job referenced by an active draft snapshot must
      // never be silently dropped on a transient "missing" poll error, only
      // when the user explicitly deletes the draft or finalizes it.
      const draftProtectedIds = new Set<string>()
      for (const arr of Object.values(draftSourceJobs)) {
        for (const c of arr) draftProtectedIds.add(c.id)
      }
      const missingJobIds = settled
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected' && isMissingJobError(r.reason))
        .map((r) => activeJobs[settled.indexOf(r)]?.id)
        .filter((id): id is string => Boolean(id) && !draftProtectedIds.has(id))
      const fulfilled = settled
        .filter((r): r is PromiseFulfilledResult<{ jobId: string; detail: JobDetail }> => r.status === 'fulfilled')
        .map((r) => r.value.detail)
      const allFailed = fulfilled.length === 0 && settled.length > 0

      if (missingJobIds.length > 0) {
        setGeneratedVideos((currentJobs) => currentJobs.filter((job) => !missingJobIds.includes(job.id)))
        unmarkActiveJobs(missingJobIds)
      }

      if (fulfilled.length > 0) {
        setGeneratedVideos((currentJobs) =>
          fulfilled.reduce((jobs, refreshedJob) => mergeJob(jobs, refreshedJob), currentJobs),
        )
      }

      if (allFailed && missingJobIds.length !== activeJobs.length) {
        pollFailureCountRef.current += 1
        if (pollFailureCountRef.current >= FAILURE_THRESHOLD) {
          const lastErr = settled.find(
            (r) => r.status === 'rejected' && !isMissingJobError(r.reason),
          ) as PromiseRejectedResult | undefined
          const reason = lastErr?.reason
          setVideoColumnMessage(
            reason instanceof ApiError ? `${reason.code}: ${reason.message}` : POLL_ERROR_MSG,
          )
        }
      } else if (missingJobIds.length > 0) {
        pollFailureCountRef.current = 0
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
          const stillPlayable = await proxiedVideoUrl(stillPublic)

          const mergeRes = await mergeVideoUrls([proxiedSrc, stillPlayable])
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
          const stillPlayable = await proxiedVideoUrl(stillPublic)

          // Prepend: still clip first, then the generated video.
          const mergeRes = await mergeVideoUrls([stillPlayable, proxiedSrc])
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

  // Stage an existing image (clip or archive) as the composer Start frame,
  // switch to image-to-video, and scroll the composer into view.
  // The image must be re-staged into the wan-frames bucket because the
  // jobs-create validator only accepts firstFrameUrl under wan-frames/{userId}/.
  async function handleUseImageAsStart(url: string) {
    if (!url) return
    setGenerationMode('image-to-video')
    const seedId = Date.now()
    setUploadedFiles((cur) => [
      ...cur.filter((f) => f.target !== 'Start'),
      {
        id: seedId,
        name: `start-${seedId}.png`,
        size: 0,
        target: 'Start',
        type: 'image/png',
        status: 'uploading',
        url: null,
        error: null,
      },
    ])
    try {
      document.getElementById('composer-start-frame')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch { /* ignore */ }

    const userId = session?.user?.id
    try {
      if (!userId) throw new Error('Sign in before using an image as a frame')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Could not read image (HTTP ${res.status})`)
      const blob = await res.blob()
      const storagePath = `${userId}/start-${Date.now()}-${crypto.randomUUID()}.png`
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

  // Reopen a finalized Final Film as an editable Draft. This is the deliberate
  // inverse of finalization: it removes the film from the Library "Final"
  // section and recreates a Draft from the exact clips/images (and cover) that
  // produced it, restores them into the live workspace, and activates that
  // draft so the user can edit and re-finalize.
  function reopenFinalAsDraft(video: JobDetail) {
    const finalId = video.id
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Reopen this final film for editing? It will move back to Drafts.')
    ) {
      return
    }

    // 1. Source snapshot that produced this final film.
    const sourceJobs = projectSourceJobs[finalId] ?? []
    const sourceImages = projectSourceImages[finalId] ?? []

    // 2. Reuse the original durable draft id from the clips' draft_group_id when
    //    present; otherwise mint a fresh draft id.
    const groupUuid =
      sourceJobs.map((j) => j.draft_group_id).find((g): g is string => !!g) ??
      sourceImages.map((i) => i.draft_group_id).find((g): g is string => !!g)
    const draftId = groupUuid
      ? draftIdForGroupUuid(groupUuid)
      : `draft-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`

    // 3. Remove the final film from the Library.
    setMergedEntries((prev) => {
      const next = prev.filter((m) => m.id !== finalId)
      persistMerged(next)
      return next
    })
    setApprovedIds((prev) => {
      if (!prev.has(finalId)) return prev
      const next = new Set(prev)
      next.delete(finalId)
      if (approvedStorageKey) {
        try { window.localStorage.setItem(approvedStorageKey, JSON.stringify(Array.from(next))) } catch { /* ignore */ }
      }
      return next
    })
    setProjectSourceJobs((prev) => {
      if (!(finalId in prev)) return prev
      const { [finalId]: _dropJobs, ...rest } = prev
      persistProjectSourceJobs(rest)
      return rest
    })
    setProjectSourceImages((prev) => {
      if (!(finalId in prev)) return prev
      const { [finalId]: _dropImgs, ...rest } = prev
      persistProjectSourceImages(rest)
      return rest
    })
    setProjectAudio((prev) => {
      if (!(finalId in prev)) return prev
      const { [finalId]: _dropAudio, ...rest } = prev
      persistProjectAudio(rest)
      return rest
    })



    // 4. Un-tombstone the draft id and per-image orphan ids so the draft lives.
    setDeletedDraftIds((prev) => {
      const next = new Set(prev)
      next.delete(draftId)
      for (const img of sourceImages) next.delete(`draft-orphan-img-${img.id}`)
      persistDeletedDraftIds(next)
      return next
    })

    // 5. Recreate the draft snapshot + entry.
    setDraftSourceJobs((prev) => {
      const next = { ...prev, [draftId]: sourceJobs }
      persistDraftSourceJobs(next)
      return next
    })
    setDraftSourceImages((prev) => {
      const next = { ...prev, [draftId]: sourceImages }
      persistDraftSourceImages(next)
      return next
    })
    setDraftEntries((prev) => {
      const next = [{ ...video, id: draftId }, ...prev.filter((d) => d.id !== draftId)]
      persistDraftEntries(next)
      return next
    })

    // 6. Re-stamp ownership back to the draft.
    if (sourceJobs.length > 0) {
      setJobDraftMap((prev) => {
        const next = { ...prev }
        for (const j of sourceJobs) next[j.id] = draftId
        persistJobDraftMap(next)
        return next
      })
    }
    if (sourceImages.length > 0) {
      setImageDraftMap((prev) => {
        const next = { ...prev }
        for (const i of sourceImages) next[i.id] = draftId
        persistImageDraftMap(next)
        return next
      })
    }

    // 7. Restore clips/images into the live workspace.
    if (sourceJobs.length > 0) {
      setGeneratedVideos((current) => sourceJobs.reduce((acc, j) => mergeJob(acc, j), current))
      setWorkspaceHiddenJobIds((curr) => {
        const next = new Set(curr)
        for (const j of sourceJobs) next.delete(j.id)
        persistWorkspaceHiddenJobIds(next)
        return next
      })
      setActiveJobIds((curr) => {
        const next = new Set(curr)
        for (const j of sourceJobs) next.add(j.id)
        persistActiveJobIds(next)
        return next
      })
    }
    if (sourceImages.length > 0) {
      setUserImages((current) => {
        const byId = new Map(current.map((i) => [i.id, i] as const))
        for (const img of sourceImages) if (!byId.has(img.id)) byId.set(img.id, img)
        return Array.from(byId.values())
      })
      setWorkspaceHiddenImageIds((curr) => {
        const next = new Set(curr)
        for (const i of sourceImages) next.delete(i.id)
        persistWorkspaceHiddenImageIds(next)
        return next
      })
      setActiveImageIds((curr) => {
        const next = new Set(curr)
        for (const i of sourceImages) next.add(i.id)
        persistActiveImageIds(next)
        return next
      })
    }

    // 8. Move the film cover over to the draft scope.
    setCoverImages((prev) => {
      const cover = prev[finalId]
      if (!cover) return prev
      const { [finalId]: _dropCover, ...rest } = prev
      const next = { ...rest, [draftId]: cover }
      persistCoverImages(next)
      return next
    })

    // 9. Activate edit mode on the draft.
    setActiveDraftId(draftId)
    persistActiveDraftId(draftId)
    setSelectedProjectId(null)
    setPreviewVideoId(null)
    setLastMergedPreview(null)
    setPreviewDismissed(true)
  }


  // wants to extend it — add a new card or run Final Film again — restore the
  // project's source clips into the live workspace so they appear in HISTORY
  // alongside the new card, then exit project-snapshot mode.
  function resumeSelectedProject() {
    if (!selectedProjectId) return
    const pid = selectedProjectId
    const isDraft = pid.startsWith('draft-')

    // Finalized "Final video" projects are read-only: never restore them into
    // the live workspace. This is the principled backstop so no edit action can
    // mutate a finished film, even if a UI control is missed.
    if (!isDraft) return


    // Pull snapshots from whichever bucket owns this project id.
    const videoSnapshot = isDraft
      ? (draftSourceJobs[pid] ?? [])
      : (projectSourceJobs[pid] ?? [])
    const imageSnapshot = isDraft
      ? (draftSourceImages[pid] ?? [])
      : (projectSourceImages[pid] ?? [])

    // Restore clips into the live workspace so the upcoming card joins them.
    if (videoSnapshot.length > 0) {
      setGeneratedVideos((current) => videoSnapshot.reduce((acc, j) => mergeJob(acc, j), current))
      setWorkspaceHiddenJobIds((curr) => {
        const next = new Set(curr)
        for (const j of videoSnapshot) next.delete(j.id)
        persistWorkspaceHiddenJobIds(next)
        return next
      })
      // Membership is authoritative: mark the resumed clips active so they
      // join the workspace + Final Film scope. Nothing outside this manifest
      // can ever leak into the film.
      setActiveJobIds((curr) => {
        const next = new Set(curr)
        for (const j of videoSnapshot) next.add(j.id)
        persistActiveJobIds(next)
        return next
      })
    }
    if (imageSnapshot.length > 0) {
      setUserImages((current) => {
        const byId = new Map(current.map((i) => [i.id, i] as const))
        for (const img of imageSnapshot) if (!byId.has(img.id)) byId.set(img.id, img)
        return Array.from(byId.values())
      })
      setWorkspaceHiddenImageIds((curr) => {
        const next = new Set(curr)
        for (const i of imageSnapshot) next.delete(i.id)
        persistWorkspaceHiddenImageIds(next)
        return next
      })
      setActiveImageIds((curr) => {
        const next = new Set(curr)
        for (const i of imageSnapshot) next.add(i.id)
        persistActiveImageIds(next)
        return next
      })
    }

    // Critical: for a draft, keep the SAME draft active so the snapshot
    // effect appends new cards to it instead of spawning a brand-new draft.
    // For a finalized project there is no draft yet, so clear activeDraftId
    // and let the effect create a fresh draft as before.
    if (isDraft) {
      // Sync the ref synchronously so ensureActiveDraftGroupId() (which reads
      // ensureActiveDraftIdRef.current) sees the resumed draft in the SAME tick,
      // before the async setActiveDraftId state update has flushed. Without this,
      // a new clip submitted right after resuming gets a fresh UUID and lands in
      // a brand-new project instead of the one the user opened.
      ensureActiveDraftIdRef.current = pid
      setActiveDraftId(pid)
      persistActiveDraftId(pid)
    } else {
      ensureActiveDraftIdRef.current = null
      setActiveDraftId(null)
      persistActiveDraftId(null)
    }

    setSelectedProjectId(null)
    setPreviewVideoId(null)
    setPreviewDismissed(true)
  }

  // Open any Library entry. For finalized projects we keep today's snapshot
  // view (selectedProjectId set, workspace untouched). For Draft projects we
  // restore the draft's clips/images into the live workspace so the user can
  // immediately keep working on them — opening a draft == resuming it.
  function openLibraryEntry(video: JobDetail) {
    setLastMergedPreview(null)
    setIsApprovedPanelOpen(false)
    setPreviewDismissed(false)

    if (video.id.startsWith('draft-')) {
      const did = video.id
      // Open the draft as a SNAPSHOT view (same as a finalized project),
      // instead of dumping its clips into the live workspace. This reuses the
      // robust `displayedVideos` snapshot path, which hydrates each clip from
      // live job data, so the user always sees the cards the draft is made of
      // — even if the stored snapshot copy is stale. Resuming/adding more
      // cards is still available via the existing Resume action.
      const clips = draftSourceJobs[did] ?? []
      const images = draftSourceImages[did] ?? []
      // Prefer the first clip/image that can actually be played for the preview
      // focus; fall back to the first entry so the preview is never wrong.
      const liveById = new Map(generatedVideos.map((v) => [v.id, v]))
      const firstPlayable =
        clips.find((c) => !!(liveById.get(c.id)?.video?.storage_path ?? c.video?.storage_path)) ??
        clips[0]
      const firstPlayableId =
        firstPlayable?.id ?? images.find((i) => !!i.storage_path)?.id ?? images[0]?.id ?? null

      setSelectedProjectId(did)
      setPreviewVideoId(firstPlayableId)
      return
    }

    setPreviewVideoId(video.id)
    setSelectedProjectId(video.id)
  }

  function parseScenarioScenes(text: string): string[] | null {
    if (!/===\s*Scene\s+\d+\s*===/i.test(text)) return null
    const parts = text
      .split(/===\s*Scene\s+\d+\s*===/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    return parts.length > 0 ? parts : null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // Scenario-writer multi-scene flow: when prompt is tagged with "=== Scene N ===",
    // split into per-scene cards and chain them with continuity instead of a single job.
    const parsedScenes = parseScenarioScenes(promptText)
    if (parsedScenes && parsedScenes.length >= 2) {
      // Resume the open draft FIRST so the multi-scene clips join the current
      // project instead of spawning a new one (same fix as the single-job path).
      resumeSelectedProject()
      const firstSceneImageUrl = readyStartFrame?.url ?? undefined
      setPromptText('')
      setUploadedFiles([])
      setComposerError(null)
      try {
        await submitScenesAsJobs(parsedScenes, firstSceneImageUrl)
      } catch {
        /* error already surfaced via composer/videoColumnMessage */
      }
      return
    }

    if (!canSubmit) {
      setComposerError(blockedReason ?? 'Add a prompt and Start/End frames before rendering.')
      return
    }

    const nextPrompt = buildPromptWithUploadedFiles(promptText.trim(), uploadedFiles)

    setIsSubmitting(true)
    setComposerError(null)
    setVideoColumnMessage(null)
    resumeSelectedProject()
    // Lock the project's aspect ratio the instant the user submits — every
    // subsequent clip in this chain must match. Released only by Start Over.
    if (!lockedProjectRatio) {
      setLockedProjectRatio(aspectRatio)
      persistLockedRatio(aspectRatio)
    }

    try {
      const plannedPrompt = nextPrompt

      // 45s auto-split: ask scenario-write to break the user's single prompt into
      // three sequential 15s scenes, then chain them via submitScenesAsJobs so each
      // becomes its own card with narrative continuity (frame-to-frame seeding).
      if (durationSeconds === 30 || durationSeconds === 45 || durationSeconds === 135) {
        const expectedScenes = durationSeconds === 135 ? 9 : durationSeconds === 45 ? 3 : 2
        setVideoColumnMessage(`Splitting your prompt into ${expectedScenes} scenes…`)
        let autoScenes: string[] = []
        try {
          const { data, error } = await supabase.functions.invoke('scenario-write', {
            body: {
              idea: plannedPrompt,
              durationSeconds,
              imageUrl: readyStartFrame?.url ?? undefined,
            },
          })
          if (!error) {
            const scenes = (data as { scenes?: unknown } | null)?.scenes
            if (Array.isArray(scenes)) {
              autoScenes = scenes
                .map((s) => (typeof s === 'string' ? s.trim() : ''))
                .filter((s) => s.length > 0)
            }
          }
        } catch {
          /* fall through to legacy Nx-same-prompt behavior */
        }

        if (autoScenes.length >= 2) {
          setPromptText('')
          setUploadedFiles([])
          setIsSubmitting(false)
          await submitScenesAsJobs(autoScenes, readyStartFrame?.url ?? undefined)
          return
        }
        // else: fall through to legacy behavior below (N identical 15s clips).
      }

      const iterations = durationSeconds === 135 ? 9 : durationSeconds === 45 ? 3 : durationSeconds === 30 ? 2 : 1
      const perClipDuration: 5 | 10 | 15 =
        (durationSeconds === 30 || durationSeconds === 45 || durationSeconds === 135) ? 15 : durationSeconds



      // The user's current selection always wins for per-clip generation.
      // (lockedProjectRatio still controls Final Film merge/preview only.)
      const effectiveRatio: Ratio = aspectRatio

      // One durable project group id for every clip created in this batch.
      const draftGroupId = ensureActiveDraftGroupId()

      for (let i = 0; i < iterations; i++) {
        let createdJob
        let seedFrames: { firstFrameUrl?: string; lastFrameUrl?: string } = {}
        let pendingEndAppendUrl: string | null = null
        let pendingStartPrependUrl: string | null = null

        if (isTextToVideo) {
          createdJob = await jobOrchestratorGateway.createJob({
            providerKey: selectedModel.providerKey,
            requestedModel: selectedModel.model,
            prompt: plannedPrompt,
            durationSeconds: perClipDuration,
            aspectRatio: effectiveRatio,
            draftGroupId,
          })
        } else if (readyStartFrame?.url && readyEndFrame?.url) {
          createdJob = await jobOrchestratorGateway.createJob({
            providerKey: selectedModel.providerKey,
            requestedModel: selectedModel.model,
            prompt: plannedPrompt,
            firstFrameUrl: readyStartFrame.url,
            lastFrameUrl: readyEndFrame.url,
            durationSeconds: perClipDuration,
            aspectRatio: effectiveRatio,
            draftGroupId,
          })
          seedFrames = { firstFrameUrl: readyStartFrame.url, lastFrameUrl: readyEndFrame.url }
        } else if (readyStartFrame?.url) {
          createdJob = await jobOrchestratorGateway.createJob({
            providerKey: selectedModel.providerKey,
            requestedModel: selectedModel.model,
            prompt: plannedPrompt,
            firstFrameUrl: readyStartFrame.url,
            durationSeconds: perClipDuration,
            aspectRatio: effectiveRatio,
            draftGroupId,
          })
          seedFrames = { firstFrameUrl: readyStartFrame.url }
        } else if (readyEndFrame?.url) {
          createdJob = await jobOrchestratorGateway.createJob({
            providerKey: selectedModel.providerKey,
            requestedModel: selectedModel.model,
            prompt: plannedPrompt,
            lastFrameUrl: readyEndFrame.url,
            durationSeconds: perClipDuration,
            aspectRatio: effectiveRatio,
            draftGroupId,
          })
          seedFrames = { lastFrameUrl: readyEndFrame.url }
        } else {
          setComposerError('Add a Start or End image before rendering.')
          return
        }

        const seededJob = buildSeededJob(plannedPrompt, createdJob, seedFrames)
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

        // Don't pin the preview to this not-yet-ready clip — let it fall
        // through to the sequential auto-stitched preview so the user always
        // sees the full project playing in order.
        setPreviewVideoId(null)
        setPreviewDismissed(false)
        setGeneratedVideos((currentJobs) => mergeJob(currentJobs, seededJob))
        markNewClip(seededJob.id)
        hydrateIfComplete(createdJob)
      }
      setPromptText('')
      setUploadedFiles([])
    } catch (error) {
      if (!isExpectedBillingError(error)) console.error('handleSubmit failed', error)
      const message = generationStartErrorMessage(error, 'Could not start video generation.')
      // Don't overwrite a more specific message set by submitScenesAsJobs.
      setComposerError((current) => current ?? message)
      setVideoColumnMessage((current) => current ?? message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function waitForLastFrameUrl(prevJobId: string, sceneLabel: string): Promise<string> {
    if (!userId) throw new Error('Sign in required to chain scenes')
    const startedAt = Date.now()
    // Match backend's longest dynamic stuck-timeout (45min for 15s clips) so
    // the UI doesn't give up before the server has had a chance to either
    // complete the job or fail it with a refund.
    const timeoutMs = 45 * 60 * 1000
    const intervalMs = 3000
    setVideoColumnMessage(`Waiting for ${sceneLabel} to finish before queuing the next scene…`)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for ${sceneLabel} to complete`)
      }
      let detail: JobDetail | null = null
      try {
        detail = await jobOrchestratorGateway.getJob(prevJobId)
      } catch (error) {
        if (isMissingJobError(error)) {
          unmarkActiveJobs([prevJobId])
          throw new Error(`${sceneLabel} was removed before it finished; cannot chain remaining scenes`)
        }
        detail = null
      }
      const status = detail ? normalizeStatus(detail.status) : 'pending'
      if (status === 'failed' || status === 'cancelled') {
        throw new Error(`${sceneLabel} failed; cannot chain remaining scenes`)
      }
      if (status === 'completed' && detail?.video?.storage_path) {
        // Prefer the server-provided last_frame_url when available — avoids
        // the canvas-tainted/CORS path entirely for the common case.
        const serverLastFrame =
          typeof detail.last_frame_url === 'string' && /^https?:\/\//i.test(detail.last_frame_url)
            ? detail.last_frame_url
            : null
        if (serverLastFrame) return serverLastFrame

        let proxied: string
        try {
          proxied = await proxiedVideoUrl(detail.video.storage_path)
        } catch (err) {
          console.error(`${sceneLabel}: proxiedVideoUrl failed`, err)
          throw new Error(`${sceneLabel}: could not load previous clip (proxy)`)
        }
        let blob: Blob
        try {
          blob = await captureLastFrameAsBlob(proxied)
        } catch (err) {
          console.error(`${sceneLabel}: captureLastFrameAsBlob failed`, err)
          const reason = err instanceof Error ? err.message : 'unknown'
          throw new Error(`${sceneLabel}: could not capture last frame (${reason})`)
        }
        const storagePath = `${userId}/scene-chain-${Date.now()}-${crypto.randomUUID()}.png`
        const { error } = await supabase.storage
          .from(FRAMES_BUCKET)
          .upload(storagePath, blob, { contentType: 'image/png', upsert: false })
        if (error) {
          console.error(`${sceneLabel}: storage upload failed`, error)
          throw new Error(`${sceneLabel}: could not upload seed frame (${error.message})`)
        }
        const { data } = supabase.storage.from(FRAMES_BUCKET).getPublicUrl(storagePath)
        return data.publicUrl
      }
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }

  async function submitScenesAsJobs(scenes: string[], firstSceneImageUrl?: string) {
    if (!scenes || scenes.length === 0) return
    if (!selectedModel) {
      const msg = 'Pick a model before sending scenes.'
      setComposerError(msg)
      throw new Error(msg)
    }

    setIsSubmitting(true)
    setComposerError(null)
    setVideoColumnMessage(null)
    resumeSelectedProject()
    if (!lockedProjectRatio) {
      setLockedProjectRatio(aspectRatio)
      persistLockedRatio(aspectRatio)
    }

    const effectiveRatio: Ratio = aspectRatio
    const perClipDuration: 5 | 10 | 15 = 15

    let previousJobId: string | null = null
    // One durable project group id for every scene clip in this scenario.
    const draftGroupId = ensureActiveDraftGroupId()
    try {
      for (let i = 0; i < scenes.length; i++) {
        const sourcePrompt = scenes[i].trim()
        if (!sourcePrompt) continue
        const sceneLabel = `Scene ${i + 1}`
        const prompt = sourcePrompt

        let startFrameUrl: string | undefined
        if (i === 0) {
          startFrameUrl = firstSceneImageUrl
        } else if (previousJobId) {
          startFrameUrl = await waitForLastFrameUrl(previousJobId, `Scene ${i}`)
        }

        setVideoColumnMessage(`Queuing ${sceneLabel}…`)
        const createdJob = await jobOrchestratorGateway.createJob({
          providerKey: selectedModel.providerKey,
          requestedModel: selectedModel.model,
          prompt,
          durationSeconds: perClipDuration,
          aspectRatio: effectiveRatio,
          firstFrameUrl: startFrameUrl,
          draftGroupId,
        })
        const seededJob = buildSeededJob(prompt, createdJob, startFrameUrl ? { firstFrameUrl: startFrameUrl } : {})
        rememberClipRatio(seededJob.id, effectiveRatio)
        if (!lockedProjectRatio) {
          setLockedProjectRatio(effectiveRatio)
          persistLockedRatio(effectiveRatio)
        }
        // Keep the preview on the full sequential auto-stitch instead of
        // pinning to each pending clip as it's queued.
        setPreviewVideoId(null)
        setPreviewDismissed(false)
        setGeneratedVideos((currentJobs) => mergeJob(currentJobs, seededJob))
        markNewClip(seededJob.id)
        hydrateIfComplete(createdJob)
        previousJobId = seededJob.id
      }
      setVideoColumnMessage(null)
    } catch (error) {
      const message = generationStartErrorMessage(error, 'Could not start scenario generation.')
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
  async function regenerateCard(
    job: JobDetail,
    override?: { providerKey?: 'wan' | 'flow' | 'local'; requestedModel?: string; prompt?: string },
  ) {
    if (regeneratingIds.has(job.id)) return

    const prompt = (override?.prompt ?? job.input_prompt ?? '').trim()
    if (!prompt) {
      setVideoColumnMessage('Cannot regenerate: prompt is empty.')
      return
    }

    // Allow caller to override provider/model (e.g. user picked a different
    // provider from the Regenerate menu). Otherwise resolve from the card,
    // falling back to currently selected model.
    const providerKey = override?.providerKey
      ?? (job.provider_key as 'wan' | 'flow' | 'local' | null)
      ?? selectedModel?.providerKey
    const requestedModel = override?.requestedModel ?? job.model_key ?? selectedModel?.model
    if (!providerKey) {
      setVideoColumnMessage('Cannot regenerate: provider missing on this card.')
      return
    }

    const ratio = getRatioFor(job)
    const firstFrameUrl = job.first_frame_url ?? undefined
    const lastFrameUrl = job.last_frame_url ?? undefined
    // Prefer the original card's duration when known; otherwise fall back to 5s.
    const rawDur = job.video?.duration ?? null
    const durationSeconds: 5 | 10 | 15 = (() => {
      if (rawDur == null) return 5
      const r = Math.round(rawDur)
      if (r >= 13) return 15
      if (r >= 8) return 10
      return 5
    })()

    setRegeneratingIds((current) => {
      const next = new Set(current)
      next.add(job.id)
      return next
    })
    setComposerError(null)
    setVideoColumnMessage(null)

    let newJobId: string | null = null
    // A regenerated clip stays in the SAME project as its source clip.
    const draftGroupId =
      job.draft_group_id ?? draftGroupUuid(jobDraftMap[job.id]) ?? ensureActiveDraftGroupId()
    try {
      const createdJob = await jobOrchestratorGateway.createJob({
        providerKey,
        requestedModel,
        prompt,
        firstFrameUrl,
        lastFrameUrl,
        durationSeconds,
        aspectRatio: ratio,
        draftGroupId,
      })
      const seededJob = buildSeededJob(prompt, createdJob, {
        firstFrameUrl,
        lastFrameUrl,
      })
      newJobId = seededJob.id
      rememberClipRatio(seededJob.id, ratio)
      // Replace the old card in place; fall back to merge if it's gone.
      setGeneratedVideos((curr) => {
        const idx = curr.findIndex((j) => j.id === job.id)
        if (idx < 0) return mergeJob(curr, seededJob)
        const next = [...curr]
        next.splice(idx, 1, seededJob)
        return next
      })
      setPreviewVideoId((cur) => (cur === job.id ? seededJob.id : cur))
      // Move the regenerating spinner from the old id to the new id so the
      // same slot keeps showing a loading state until polling resolves.
      setRegeneratingIds((current) => {
        const next = new Set(current)
        next.delete(job.id)
        next.add(seededJob.id)
        return next
      })
      markDerivedClip(job.id, seededJob.id)
      hydrateIfComplete(createdJob)
      // Permanently delete the old card now that the regenerated card has
      // replaced it: removes the DB row, the Storage video file, and every
      // local reference (workspace, project/archive, library, preview).
      // The new card uses a different id, so it is untouched. A cleanup
      // failure must not roll back or hide the freshly created card.
      try {
        await deleteCardConfirmed(job.id)
      } catch (cleanupError) {
        const cleanupMsg =
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        setVideoColumnMessage(`Regenerated, but could not remove the old card: ${cleanupMsg}`)
      }
    } catch (error) {
      const message = generationStartErrorMessage(error, 'Could not regenerate this card.')
      setVideoColumnMessage(message)
    } finally {
      setRegeneratingIds((current) => {
        const targetId = newJobId ?? job.id
        if (!current.has(targetId)) return current
        const next = new Set(current)
        next.delete(targetId)
        return next
      })
    }
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
    setMusicTimeline([0, mergedDurationSec])
    setIsMusicDialogOpen(true)
    // Persist the uploaded track so it appears in Storage › Audio.
    void persistUserAudio(file, 'music', file.name)
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
    setMusicTimeline([0, 0])
    setIsMusicDialogOpen(false)
  }

  function handleVoiceoverAsSoundtrack(url: string, name: string) {
    if (voiceoverUrl) {
      try { URL.revokeObjectURL(voiceoverUrl) } catch { /* ignore */ }
    }
    setVoiceoverUrl(url)
    setVoiceoverName(name)
    setVoiceoverDuration(0)
    setVoiceoverRange([0, 0])
    setVoiceoverTimeline([0, mergedDurationSec])
    setIsVoiceoverOpen(false)
    // Voiceover persistence to Storage › Audio happens at generation time
    // inside VoiceoverDialog, so no extra save is needed here.
  }



  function handleClearVoiceover() {
    if (voiceoverUrl) {
      try { URL.revokeObjectURL(voiceoverUrl) } catch { /* ignore */ }
    }
    setVoiceoverUrl(null)
    setVoiceoverName(null)
    setVoiceoverVolume(1)
    setVoiceoverClipVolume(0.3)
    setVoiceoverDuration(0)
    setVoiceoverRange([0, 0])
    setVoiceoverTimeline([0, 0])
  }

  function handlePreviewMusicRange() {
    musicWaveformRef.current?.playRange(musicRange[0], musicRange[1])
  }

  async function handleMergeAllVideos() {
    if (isMerging) return
    // Capture snapshots before resume (resume's setState won't reflect synchronously).
    const videoSnapshotForMerge = selectedProjectId
      ? (projectSourceJobs[selectedProjectId] ?? draftSourceJobs[selectedProjectId] ?? [])
      : []
    const imageSnapshotForMerge = selectedProjectId
      ? (projectSourceImages[selectedProjectId] ?? draftSourceImages[selectedProjectId] ?? [])
      : []
    resumeSelectedProject()

    // Build the merge set strictly from the ACTIVE scope so clips/images
    // belonging to other drafts or finalized projects can never leak in.
    //
    // - Selected project/draft: use ONLY that snapshot (hydrated with live data
    //   when available). Never union with all generatedVideos/userImages.
    // - Default workspace: same filtering rule as displayedVideos +
    //   visibleUserImages (exclude clips claimed by ANY other project/draft
    //   snapshot, and workspace-hidden ids).
    const videoJobsById = new Map<string, JobDetail>()
    const liveVideoById = new Map(generatedVideos.map((v) => [v.id, v]))
    const liveImageById = new Map(userImages.map((i) => [i.id, i]))
    let imageList: UserImageItem[] = []

    if (selectedProjectId) {
      for (const j of videoSnapshotForMerge) {
        const live = liveVideoById.get(j.id) ?? j
        if (normalizeStatus(live.status) === 'completed' && live.video?.storage_path) {
          videoJobsById.set(live.id, live)
        }
      }
      imageList = imageSnapshotForMerge.map((s) => liveImageById.get(s.id) ?? s)
    } else {
      const claimedJobIds = new Set<string>()
      for (const clips of Object.values(projectSourceJobs)) {
        for (const c of clips) claimedJobIds.add(c.id)
      }
      for (const [did, clips] of Object.entries(draftSourceJobs)) {
        if (did === activeDraftId) continue
        for (const c of clips) claimedJobIds.add(c.id)
      }
      for (const v of completedSourceVideos) {
        if (!activeJobIds.has(v.id)) continue
        if (workspaceHiddenJobIds.has(v.id)) continue
        if (claimedJobIds.has(v.id)) continue
        videoJobsById.set(v.id, v)
      }
      imageList = visibleUserImages
    }

    const baseClips: UnifiedClip[] = [
      ...Array.from(videoJobsById.values()).map((job) => ({
        kind: 'video' as const,
        id: job.id,
        createdAt: job.created_at,
        job,
      })),
      ...imageList.map((image) => ({
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

    // Pre-flight: verify each video clip's source file is actually reachable.
    // Stale snapshots in localStorage can reference Veo files that were deleted
    // on the server; those would 404 inside mergeVideoUrls and abort the whole
    // Final Film with an opaque "Failed to load video" error.
    const brokenClips: { id: string; filename: string; jobId: string }[] = []
    {
      const checks = await Promise.all(
        eligibleClips.map(async (clip) => {
          if (clip.kind !== 'video') return { clip, ok: true }
          const src = clip.job.video?.storage_path as string | undefined
          if (!src) return { clip, ok: false }
          try {
            const probeUrl = await proxiedVideoUrl(src)
            const res = await fetch(probeUrl, { method: 'HEAD', cache: 'no-store' })
            return { clip, ok: res.ok }
          } catch {
            return { clip, ok: false }
          }
        }),
      )
      const goodClips: UnifiedClip[] = []
      for (const { clip, ok } of checks) {
        if (ok) {
          goodClips.push(clip)
        } else if (clip.kind === 'video') {
          const src = (clip.job.video?.storage_path as string | undefined) ?? ''
          const filename = src.split('/').pop() || clip.id
          brokenClips.push({ id: clip.id, filename, jobId: clip.id })
        }
      }
      eligibleClips = goodClips
    }

    if (brokenClips.length > 0) {
      // Drafts are protected: clips that belong to any draft snapshot are
      // only skipped for this Final Film run (so the user can regenerate),
      // but their workspace card stays so the draft never silently loses
      // its video content. Non-draft broken clips are hidden as before.
      const draftProtectedIds = new Set<string>()
      for (const arr of Object.values(draftSourceJobs)) {
        for (const c of arr) draftProtectedIds.add(c.id)
      }
      const hideable = brokenClips.filter((b) => !draftProtectedIds.has(b.jobId))
      if (hideable.length > 0) {
        setWorkspaceHiddenJobIds((curr) => {
          const next = new Set(curr)
          for (const b of hideable) next.add(b.jobId)
          persistWorkspaceHiddenJobIds(next)
          return next
        })
        unmarkActiveJobs(hideable.map((b) => b.jobId))
      }
    }

    if (eligibleClips.length < 1) {
      const names = brokenClips.map((b) => `"${b.filename}"`).join(', ')
      setVideoColumnMessage(
        brokenClips.length > 0
          ? `Source file(s) missing on server: ${names}. Broken clip(s) removed from workspace — please regenerate.`
          : 'Need at least 1 finished item (video or image) to finalize.',
      )
      return
    }

    // Single-clip Final Film is always allowed — edits and audio are optional.
    setIsMerging(true)
    setMergeProgress(0)
    setMergeStage(null)
    setVideoColumnMessage(null)
    // Final Film now saves the recorder's stable WebM output directly. Do not
    // pre-load ffmpeg.wasm here; that was the root cause of long projects
    // freezing around the old 95% encoding stage.
    if (brokenClips.length > 0) {
      const names = brokenClips.map((b) => `"${b.filename}"`).join(', ')
      console.warn('[merge] skipped broken clips:', names)
    }
    // Pre-flight: refresh the auth session so the storage upload at the end
    // of Final Film never fails with a stale token (which would otherwise
    // leave the UI stuck right after the merge finalizes).
    try { await supabase.auth.refreshSession() } catch { /* ignore */ }
    // Declared here so the `finally` block can always clear it on success.
    let pipelineTimer: ReturnType<typeof setTimeout> | null = null
    try {
      // Determine target dimensions from the first video clip (mergeVideos.ts uses
      // the first clip's intrinsic size). If no video, fall back to a 1080p frame.
      const firstVideo = eligibleClips.find((c) => c.kind === 'video') as Extract<UnifiedClip, { kind: 'video' }> | undefined
      let targetSize: { width: number; height: number } | undefined
      const firstVideoSrc = firstVideo
        ? (editedClips[firstVideo.job.id]?.url ?? (firstVideo.job.video?.storage_path as string | undefined))
        : undefined
      if (firstVideoSrc) {
        try {
          const probeUrl = await proxiedVideoUrl(firstVideoSrc)
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

      // Build the merge clip list in display order. Image clips are handed
      // to the merger as native `{ kind: 'image', durationSec }` entries —
      // the merger paints them straight onto the recording canvas, which
      // avoids the duration-less MediaRecorder WebM that used to break
      // Final Film with "Clip #N has no playable content (duration=0, ...)".
      const mergeClips: import('@/modules/generator-ui/lib/mergeVideos').MergeClip[] = []
      for (const clip of eligibleClips) {
        if (clip.kind === 'video') {
          // Prefer the locally trimmed/edited blob when one exists, so a card
          // the user cut down is merged as its TRIMMED version — not the
          // original long source. Falls back to the stored file otherwise.
          const rawSrc =
            editedClips[clip.job.id]?.url ??
            (clip.job.video!.storage_path as string)
          const src = await proxiedVideoUrl(rawSrc)
          mergeClips.push({ kind: 'video', url: src })
        } else {
          const seconds = Math.max(1, Math.min(15, clip.image.still_duration_seconds || 3))
          const src = await proxiedVideoUrl(clip.image.storage_path)
          mergeClips.push({ kind: 'image', url: src, durationSec: seconds })
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
                  timelineStartSec: musicTimeline[1] > musicTimeline[0] ? musicTimeline[0] : undefined,
                  timelineEndSec: musicTimeline[1] > musicTimeline[0] ? musicTimeline[1] : undefined,
                }
              : undefined,
            voiceover: hasVoiceover
              ? {
                  src: voiceoverUrl as string,
                  volume: voiceoverVolume,
                  sourceStartSec: voiceoverRange[1] > voiceoverRange[0] ? voiceoverRange[0] : undefined,
                  sourceEndSec: voiceoverRange[1] > voiceoverRange[0] ? voiceoverRange[1] : undefined,
                  timelineStartSec: voiceoverTimeline[1] > voiceoverTimeline[0] ? voiceoverTimeline[0] : undefined,
                  timelineEndSec: voiceoverTimeline[1] > voiceoverTimeline[0] ? voiceoverTimeline[1] : undefined,
                }
              : undefined,
            clipVolume: mixedClipVolume,
          }
        : undefined
      // Overall pipeline watchdog: if the entire merge+transcode+upload chain
      // hasn't finished in 10 min, surface a clear error instead of leaving
      // the UI stuck on 95% forever. The timer id is cleared in `finally` so a
      // successful run never leaves a dangling 10-min timeout behind.
      const PIPELINE_TIMEOUT_MS = 10 * 60_000
      const pipelineTimeout = new Promise<never>((_, reject) => {
        pipelineTimer = setTimeout(() => reject(new Error('Final Film took too long (>10 min). Please try again with fewer or shorter clips.')), PIPELINE_TIMEOUT_MS)
      })

      const abortController = new AbortController()
      mergeAbortRef.current = abortController
      const mergeRes = await Promise.race([
        mergeVideoUrls(
          mergeClips,
          (p) => {
            // Map stages into a monotonic 1..99 percent so the UI keeps
            // moving past the old 95% cap during encode and upload.
            if (p.stage === 'encoding') {
              setMergeStage('encoding')
              setMergeProgress(Math.max(95, Math.min(99, Math.round(p.ratio * 100))))
            } else if (p.stage === 'finalizing') {
              setMergeStage('finalizing')
              setMergeProgress((curr) => Math.max(curr, 95))
            } else {
              setMergeStage('recording')
              // Record/transition stages cap at 94 to reserve 95+ for finalize/encode.
              setMergeProgress(Math.max(1, Math.min(94, Math.round(p.ratio * 100))))
            }
          },
          audioOpt,
          transitionsForMerge,
          abortController.signal,
        ),
        pipelineTimeout,
      ])
      if (abortController.signal.aborted) throw new MergeCancelledError()

      setMergeStage('uploading')
      setMergeProgress(99)
      const filename = `merged-${Date.now()}.${mergeRes.extension}`
      const storagePath = `${userId}/${filename}`
      // Hard timeout on the upload: if Supabase storage hangs (network/CDN
      // hiccup), we'd otherwise sit at 99% forever. 2 minutes is plenty for
      // a typical Final Film blob (<200MB).
      const uploadPromise = supabase.storage
        .from(MERGED_BUCKET)
        .upload(storagePath, mergeRes.blob, { contentType: mergeRes.mimeType, upsert: false })
      const uploadTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Upload timed out after 120s. Please check your connection and try again.')), 120_000),
      )
      const { error: upErr } = await Promise.race([uploadPromise, uploadTimeout]) as Awaited<typeof uploadPromise>
      if (upErr) throw new Error(upErr.message)

      setMergeProgress(100)
      setMergeStage(null)
      const { data } = supabase.storage.from(MERGED_BUCKET).getPublicUrl(storagePath)
      const publicUrl = data.publicUrl


      // Final Film preview overlay — Pending source clips stay untouched.
      const firstClipId = eligibleClips[0]?.id
      const mergedRatio: Ratio = (firstClipId ? clipAspectRatios[firstClipId] : undefined) ?? aspectRatio
      setLastMergedPreview({ url: publicUrl, ratio: mergedRatio, clipCount: mergeClips.length })
      setPreviewDismissed(false)
      setPreviewVideoId(null)

      // Register the merged film in Your Library (left panel). This does NOT
      // touch Pending (generatedVideos); it only appends a JobDetail entry to
      // mergedEntries + approvedIds (persisted in localStorage), exactly like
      // saved library cards.
      const mergedId = `merged-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
      const nowIso = new Date().toISOString()
      const libraryEntry: JobDetail = {
        id: mergedId,
        status: 'completed',
        input_prompt: `Final Film (${mergeClips.length} clip${mergeClips.length === 1 ? '' : 's'})`,
        provider_key: 'final-film',
        model_key: 'merge',
        provider_job_id: null,
        first_frame_url: null,
        last_frame_url: null,
        requested_duration: null,
        requested_aspect_ratio: mergedRatio,
        created_at: nowIso,
        updated_at: nowIso,
        video: {
          id: mergedId,
          storage_path: publicUrl,
          thumbnail_url: null,
          aspect_ratio: mergedRatio,
          duration: null,
        },
      }
      setMergedEntries((prev) => {
        const next = [libraryEntry, ...prev]
        persistMerged(next)
        return next
      })
      setApprovedIds((prev) => {
        const next = new Set(prev)
        next.add(mergedId)
        if (approvedStorageKey) {
          try { window.localStorage.setItem(approvedStorageKey, JSON.stringify(Array.from(next))) } catch { /* ignore */ }
        }
        return next
      })
      // Snapshot the source clips (video jobs only) so opening this Library
      // card later shows the correct HISTORY in selected-project mode.
      {
        const sourceJobs: JobDetail[] = eligibleClips
          .filter((c): c is Extract<UnifiedClip, { kind: 'video' }> => c.kind === 'video')
          .map((c) => c.job)
        if (sourceJobs.length > 0) {
          // Persist each source clip's video bytes to our own bucket so the
          // snapshot keeps working even after the provider's signed URL
          // expires. If a clip is already on our host, skip the re-upload.
          const OWN_HOST_RE = /(^|\.)supabase\.co$/i
          const isOwnHosted = (url: string): boolean => {
            try {
              const u = new URL(url)
              if (typeof window !== 'undefined' && u.host === window.location.host) return true
              return OWN_HOST_RE.test(u.host)
            } catch { return false }
          }
          const stableJobs: JobDetail[] = await Promise.all(
            sourceJobs.map(async (job) => {
              const src = job.video?.storage_path
              if (!src || !userId || isOwnHosted(src)) return job
              // Per-source hard timeout: a hanging fetch/upload here must never
              // keep Final Film spinning — the film itself is already saved.
              const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
                Promise.race([
                  p,
                  new Promise<T>((_, reject) =>
                    setTimeout(() => reject(new Error('snapshot timed out')), ms),
                  ),
                ])
              try {
                const proxied = await proxiedVideoUrl(src)
                const resp = await withTimeout(fetch(proxied), 60_000)
                if (!resp.ok) throw new Error(`fetch ${resp.status}`)
                const blob = await withTimeout(resp.blob(), 60_000)
                const ct = blob.type || 'video/mp4'
                const ext = ct.includes('webm') ? 'webm' : 'mp4'
                const path = `${userId}/source-snapshot-${job.id}-${Date.now()}.${ext}`
                const up = await withTimeout(
                  supabase.storage
                    .from(MERGED_BUCKET)
                    .upload(path, blob, { contentType: ct, upsert: false }),
                  90_000,
                )
                if (up.error) throw new Error(up.error.message)
                const publicUrl = supabase.storage.from(MERGED_BUCKET).getPublicUrl(path).data.publicUrl
                return { ...job, video: { ...job.video!, storage_path: publicUrl } }
              } catch (err) {
                console.warn('[snapshot] source persist failed; keeping original URL', { jobId: job.id, err })
                return job
              }
            }),
          )
          const nextMap = { ...projectSourceJobs, [mergedId]: stableJobs }
          setProjectSourceJobs(nextMap)
          persistProjectSourceJobs(nextMap)
        }
      }
      // Same for source images: claim them under this merged project so they
      // disappear from Pending and reappear inside the Library card's HISTORY.
      {
        const sourceImages: UserImageItem[] = eligibleClips
          .filter((c): c is Extract<UnifiedClip, { kind: 'image' }> => c.kind === 'image')
          .map((c) => c.image)
        if (sourceImages.length > 0) {
          const nextImgMap = { ...projectSourceImages, [mergedId]: sourceImages }
          setProjectSourceImages(nextImgMap)
          persistProjectSourceImages(nextImgMap)
        }
      }
      // Snapshot the project's own music / voiceover into the public
      // MERGED_BUCKET so the finalized card can play + download the exact audio
      // that this project used, surviving refresh. Best-effort: never block
      // finalization if an audio copy fails.
      if ((hasMusic || hasVoiceover) && userId) {
        try {
          const entry: ProjectAudio = {}
          if (hasMusic && musicUrl) {
            const url = await persistAudioToStorage(musicUrl, 'music', mergedId)
            if (url) entry.music = { url, name: musicName ?? 'Music' }
          }
          if (hasVoiceover && voiceoverUrl) {
            const url = await persistAudioToStorage(voiceoverUrl, 'voice', mergedId)
            if (url) entry.voiceover = { url, name: voiceoverName ?? 'Voiceover' }
          }
          if (entry.music || entry.voiceover) {
            const nextAudio = { ...projectAudio, [mergedId]: entry }
            setProjectAudio(nextAudio)
            persistProjectAudio(nextAudio)
          }
        } catch (err) {
          console.warn('[audio-snapshot] failed', err)
        }
      }

      // The in-progress chain just became a Final video — retire any draft
      // entries tied to this finalization so they disappear from the Drafts
      // section. Source clips are already claimed under
      // projectSourceJobs[mergedId], so they remain visible inside the new
      // Library card's HISTORY view.
      {
        const draftIdsToRemove = new Set<string>()
        if (activeDraftId) draftIdsToRemove.add(activeDraftId)
        if (selectedProjectId && selectedProjectId.startsWith('draft-')) {
          draftIdsToRemove.add(selectedProjectId)
        }
        if (draftIdsToRemove.size > 0) {
          setDraftEntries((prev) => {
            const next = prev.filter((d) => !draftIdsToRemove.has(d.id))
            persistDraftEntries(next)
            return next
          })
          setDraftSourceJobs((prev) => {
            const next = { ...prev }
            for (const id of draftIdsToRemove) delete next[id]
            persistDraftSourceJobs(next)
            return next
          })
          setDraftSourceImages((prev) => {
            const next = { ...prev }
            for (const id of draftIdsToRemove) delete next[id]
            persistDraftSourceImages(next)
            return next
          })
          setDeletedDraftIds((prev) => {
            const next = new Set(prev)
            for (const id of draftIdsToRemove) next.add(id)
            persistDeletedDraftIds(next)
            return next
          })
        }
        // Re-stamp ownership: the exact items that went into this Final Film
        // now belong to the merged project, not a draft. Strip them from the
        // draft ownership maps so the orphan/backfill effects can never pull
        // them back into a draft and leak them into another project's Pending.
        {
          const mergedJobIds = new Set(
            eligibleClips.filter((c) => c.kind === 'video').map((c) => c.id),
          )
          const mergedImageIds = new Set(
            eligibleClips.filter((c) => c.kind === 'image').map((c) => c.id),
          )
          if (mergedJobIds.size > 0) {
            setJobDraftMap((prev) => {
              let changed = false
              const next = { ...prev }
              for (const id of mergedJobIds) { if (id in next) { delete next[id]; changed = true } }
              if (!changed) return prev
              persistJobDraftMap(next)
              return next
            })
          }
          if (mergedImageIds.size > 0) {
            setImageDraftMap((prev) => {
              let changed = false
              const next = { ...prev }
              for (const id of mergedImageIds) { if (id in next) { delete next[id]; changed = true } }
              if (!changed) return prev
              persistImageDraftMap(next)
              return next
            })
            // Tombstone the per-item orphan draft ids so backfill can't rebuild
            // an isolated draft from these now-finalized images.
            setDeletedDraftIds((prev) => {
              const next = new Set(prev)
              for (const id of mergedImageIds) next.add(`draft-orphan-img-${id}`)
              persistDeletedDraftIds(next)
              return next
            })
          }
        }
        // Carry the Film Cover from the finalized draft/project scope over to
        // the new merged project so it stays attached and visible after Final
        // Film, and never lingers under the now-retired draft id.
        {
          const sourceScopeKeys = [selectedProjectId, activeDraftId].filter(
            (k): k is string => !!k,
          )
          let movedCover: UserImageItem | null = null
          for (const k of sourceScopeKeys) {
            if (coverImages[k]) { movedCover = coverImages[k]; break }
          }
          if (movedCover) {
            setCoverImages((prev) => {
              const next = { ...prev }
              for (const k of sourceScopeKeys) delete next[k]
              next[mergedId] = movedCover as UserImageItem
              persistCoverImages(next)
              return next
            })
          }
        }
        setActiveDraftId(null)
        persistActiveDraftId(null)
        if (selectedProjectId && selectedProjectId.startsWith('draft-')) {
          setSelectedProjectId(mergedId)
        }
      }



      // Final Film is done — auto Start Over so the workspace is fresh for
      // the next project. Source clips are already claimed by
      // projectSourceJobs[mergedId] / projectSourceImages[mergedId], so
      // resetWorkspace will only hide them from the workspace, not delete.
      // The new Final Film stays in mergedEntries (Library) untouched.
      resetWorkspace({ keepPreview: false })
      setActiveJobIds(new Set()); persistActiveJobIds(new Set())
      setActiveImageIds(new Set()); persistActiveImageIds(new Set())









    } catch (err) {
      if (err instanceof MergeCancelledError) {
        console.info('[merge] cancelled by user')
        setVideoColumnMessage('Rendering cancelled.')
      } else {
      // Log the raw err first so we never lose detail to fallback strings.
      console.error('[merge] failed', err, {
        type: typeof err,
        isError: err instanceof Error,
        keys: err && typeof err === 'object' ? Object.keys(err as object) : null,
      })
      const msg = err instanceof Error
        ? (err.message || err.name || 'Error')
        : typeof err === 'string'
          ? err
          : (() => { try { return JSON.stringify(err) || 'unknown error' } catch { return 'unknown error' } })()
      const urlMatch = msg.match(/https?:\/\/\S+/)
      const filename = urlMatch ? (urlMatch[0].split('?')[0].split('/').pop() || '') : ''
      const friendly = filename
        ? `Source file "${filename}" could not be loaded from the server (it may have been deleted). Remove that clip from the workspace and try again.`
        : `Could not load source video for merge — please try again in a moment. (${msg})`
      setVideoColumnMessage(friendly)
      }
    } finally {
      if (pipelineTimer) { clearTimeout(pipelineTimer); pipelineTimer = null }
      mergeAbortRef.current = null
      setIsMerging(false)
      setMergeProgress(0)
      setMergeStage(null)
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
    setMergeStage(null)
    // Drop the transient Final Film preview so Start Over fully clears it.
    setLastMergedPreview(null)
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
    // Draft snapshots are also protected so the Draft project in Library
    // keeps its cards alive after Start Over.
    for (const clips of Object.values(draftSourceJobs)) {
      for (const c of clips) claimedJobIds.add(c.id)
    }
    const claimedImageIds = new Set<string>()
    for (const imgs of Object.values(projectSourceImages)) {
      for (const i of imgs) claimedImageIds.add(i.id)
    }
    for (const imgs of Object.values(draftSourceImages)) {
      for (const i of imgs) claimedImageIds.add(i.id)
    }
    const looseJobIds = Array.from(activeJobIds).filter((id) => !claimedJobIds.has(id))
    const looseImageIds = Array.from(activeImageIds).filter((id) => !claimedImageIds.has(id))

    resetWorkspace({ keepPreview: false })

    // Close the active draft id so the next workspace activity opens a new
    // draft (the previous one is preserved in Library as-is).
    setActiveDraftId(null)
    persistActiveDraftId(null)

    // Clear the active manifest immediately so a refresh during the network
    // round-trip doesn't bring orphans back via the hydrate-protect path.
    setActiveJobIds(new Set()); persistActiveJobIds(new Set())
    setActiveImageIds(new Set()); persistActiveImageIds(new Set())


    if (looseImageIds.length === 0) {
      // Loose jobs are kept on the server (Storage archive); resetWorkspace
      // already hid them from the workspace via workspaceHiddenJobIds.
      setGeneratedVideos((curr) => curr.filter((j) => !looseJobIds.includes(j.id)))
      return
    }

    // Source images are not films and are not listed in Storage, so they are
    // still removed. Loose video jobs are intentionally kept on the server.
    const results = await Promise.allSettled(
      looseImageIds.map((id) => generatorUiGateway.deleteUserImage(id)),
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed > 0) {
      console.error(`Start Over: ${failed} item(s) failed to delete`)
      setVideoColumnMessage(`Could not permanently delete ${failed} item(s). They may reappear after refresh.`)
    }
    // Drop dropped ids from local state immediately.
    setGeneratedVideos((curr) => curr.filter((j) => !looseJobIds.includes(j.id)))
    setUserImages((curr) => curr.filter((i) => !looseImageIds.includes(i.id)))
  }

  // On a fresh login (not a refresh), AuthProvider sets `pending-fresh-start`.
  // Consume it once to reset the workspace so the dashboard opens blank.
  useEffect(() => {
    if (!userId) return
    let shouldReset = false
    try {
      const key = `pending-fresh-start:${userId}`
      if (window.localStorage.getItem(key) === '1') {
        window.localStorage.removeItem(key)
        shouldReset = true
      }
    } catch { /* ignore */ }
    if (shouldReset) {
      // Defer to next tick so dependent state/handlers are wired up.
      setTimeout(() => { handleStartOver() }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const job =
          generatedVideos.find((v) => v.id === trimmingJobId) ??
          mergedEntries.find((v) => v.id === trimmingJobId) ??
          Object.values(projectSourceJobs).flat().find((v) => v.id === trimmingJobId) ??
          Object.values(draftSourceJobs).flat().find((v) => v.id === trimmingJobId) ??
          librarySavedJobs[trimmingJobId]
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
      {(() => {
        if (!v2vJobId) return null
        const job =
          generatedVideos.find((v) => v.id === v2vJobId) ??
          mergedEntries.find((v) => v.id === v2vJobId) ??
          Object.values(projectSourceJobs).flat().find((v) => v.id === v2vJobId) ??
          Object.values(draftSourceJobs).flat().find((v) => v.id === v2vJobId) ??
          librarySavedJobs[v2vJobId]
        if (!job?.video?.storage_path) return null
        if (!v2vSrc) return null
        const sourceRatio = getRatioFor(job)
        return (
          <VideoToVideoDialog
            open
            onOpenChange={(o) => { if (!o) { setV2vJobId(null); setV2vSrc(null) } }}
            videoUrl={v2vSrc}
            userId={userId}
            sourceAspectRatio={sourceRatio}
            title={job?.input_prompt ?? undefined}
            draftGroupId={job.draft_group_id ?? draftGroupUuid(jobDraftMap[job.id]) ?? ensureActiveDraftGroupId()}
            onJobCreated={(seeded, ratio) => {
              setGeneratedVideos((curr) => mergeJob(curr, seeded))
              rememberClipRatio(seeded.id, ratio)
              markDerivedClip(job.id, seeded.id)
            }}
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
            className={`fixed left-4 top-4 grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-200/80 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-zinc-100 sm:left-5 sm:top-5 ${isApprovedPanelOpen ? 'z-30' : 'z-50'}`}
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

      <div className={`fixed left-14 top-4 flex items-center gap-2 sm:left-16 sm:top-5 ${isApprovedPanelOpen ? 'z-30' : 'z-50'}`}>
        <button
          type="button"
          onClick={() => { setIsCalendarOpen(true) }}
          aria-label={hasOccasionToday ? 'Today has an occasion — open calendar' : 'Open calendar'}
          title={hasOccasionToday ? 'Today has an occasion — take a look' : 'Calendar'}
          className={`group flex h-9 items-center gap-2 rounded-md border px-2.5 transition ${
            hasOccasionToday
              ? 'border-red-500/40 bg-red-500/10 hover:bg-red-500/15'
              : 'border-emerald-500/30 bg-emerald-500/[0.08] hover:bg-emerald-500/15'
          }`}
        >
          <span className="relative grid place-items-center">
            <CalendarDays
              className={`h-[20px] w-[20px] ${hasOccasionToday ? 'text-red-300' : 'text-emerald-300'}`}
              aria-hidden="true"
            />
            {hasOccasionToday && (
              <span className="absolute -right-1 -top-1 inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-red-500/70" aria-hidden="true" />
            )}
            <span
              className={`absolute -right-1 -top-1 inline-block h-2.5 w-2.5 rounded-full ring-2 ring-[#0b0c0e] ${
                hasOccasionToday ? 'bg-red-500' : 'bg-emerald-500'
              }`}
              aria-hidden="true"
            />
          </span>
          <span
            className={`text-[11px] font-medium uppercase tracking-[0.12em] ${
              hasOccasionToday ? 'text-red-300' : 'text-emerald-300'
            }`}
          >
            {hasOccasionToday ? 'Occasion today' : 'No occasion'}
          </span>
        </button>

        <button
          type="button"
          aria-label="Open storage archive"
          title="Storage"
          onClick={() => { setIsArchiveOpen(true); void loadArchive() }}
          className="grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-200/80 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-zinc-100"
        >
          <Database className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>

        <UsageStatsPopover triggerClassName="grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-200/80 transition hover:border-white/10 hover:bg-white/[0.045] hover:text-zinc-100" />
      </div>



      <Dialog
        open={isArchiveOpen}
        onOpenChange={(next) => {
          setIsArchiveOpen(next)
          if (next) void loadArchive()
          else setPlayerFilm(null)
        }}
      >
        <DialogContent
          className="z-50 flex h-[min(90vh,52rem)] w-[min(72rem,95vw)] max-w-none flex-col gap-0 border-white/10 bg-[#0b0c0e]/95 p-0 text-zinc-100 shadow-[0_22px_70px_rgba(0,0,0,0.4)] backdrop-blur-xl"
        >
          <DialogHeader className="border-b border-white/10 px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2">
                <Database className="h-5 w-5 text-sky-300" aria-hidden="true" />
                <DialogTitle className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-300">
                  Storage
                </DialogTitle>
                <span className="grid h-6 min-w-6 place-items-center rounded-full border border-white/10 px-2 text-xs font-semibold text-zinc-300">
                  {archiveTab === 'films'
                    ? archiveJobs.length
                    : archiveTab === 'images'
                      ? archiveImages.length
                      : archiveTab === 'products'
                        ? archiveProductImages.length
                        : archiveAudio.length}
                </span>
              </div>
            </div>

            <DialogDescription className="mt-1 text-left text-xs text-zinc-500">
              {archiveTab === 'films'
                ? "All films — everything you've created"
                : archiveTab === 'images'
                  ? "All images — everything you've created"
                  : archiveTab === 'products'
                    ? "Product photos — upload and store your product images"
                    : "All audio — uploaded music and generated voiceovers"}
            </DialogDescription>

            <div className="mt-3 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
              <button
                type="button"
                onClick={() => setArchiveTab('films')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  archiveTab === 'films'
                    ? 'bg-white/[0.08] text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" />
                Films
                <span className="ml-1 rounded-full bg-black/30 px-1.5 text-[10px] tabular-nums">{archiveJobs.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setArchiveTab('images')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  archiveTab === 'images'
                    ? 'bg-white/[0.08] text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Images
                <span className="ml-1 rounded-full bg-black/30 px-1.5 text-[10px] tabular-nums">{archiveImages.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setArchiveTab('audio')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  archiveTab === 'audio'
                    ? 'bg-white/[0.08] text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Music2 className="h-3.5 w-3.5" aria-hidden="true" />
                Audio
                <span className="ml-1 rounded-full bg-black/30 px-1.5 text-[10px] tabular-nums">{archiveAudio.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setArchiveTab('products')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  archiveTab === 'products'
                    ? 'bg-white/[0.08] text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Package className="h-3.5 w-3.5" aria-hidden="true" />
                Product Photos
                <span className="ml-1 rounded-full bg-black/30 px-1.5 text-[10px] tabular-nums">{archiveProductImages.length}</span>
              </button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {(() => {
              const currentIds =
                archiveTab === 'films'
                  ? archiveJobs.map((j) => j.id)
                  : archiveTab === 'images'
                    ? archiveImages.map((i) => i.id)
                    : archiveTab === 'products'
                      ? archiveProductImages.map((i) => i.id)
                      : archiveAudio.map((a) => a.id)
              if (currentIds.length === 0) return null
              const selectedCount = currentIds.filter((id) => selectedArchiveIds.has(id)).length
              const allSelected = selectedCount === currentIds.length && currentIds.length > 0
              return (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedArchiveIds(allSelected ? new Set() : new Set(currentIds))
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.07]"
                  >
                    <Checkbox checked={allSelected} className="pointer-events-none h-4 w-4" />
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                  <div className="flex items-center gap-3">
                    {selectedCount > 0 ? (
                      <span className="text-xs text-zinc-400">{selectedCount} selected</span>
                    ) : null}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          disabled={selectedCount === 0 || isBulkDeleting}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isBulkDeleting ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Delete selected
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {selectedCount} selected item{selectedCount === 1 ? '' : 's'}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove the selected items and their files. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => { void handleBulkDeleteArchive() }}
                            className="bg-rose-600 text-white hover:bg-rose-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )
            })()}
            {archiveTab === 'products' ? (() => {
              return (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">Upload a product photo</p>
                      <p className="mt-0.5 text-xs text-zinc-500">JPG, PNG or WEBP — up to 10 MB. Saved here for reuse.</p>
                      {productUploadError ? (
                        <p className="mt-1 text-xs text-rose-300">{productUploadError}</p>
                      ) : null}
                    </div>
                    <input
                      ref={productPhotoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { void handleProductPhotoSelected(e) }}
                    />
                    <div className="flex shrink-0 items-center gap-2">
                      <input
                        type="text"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        maxLength={100}
                        placeholder="Product name (optional)"
                        disabled={isUploadingProductPhoto || !userId}
                        className="w-44 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-sky-300/40 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={handlePickProductPhoto}
                        disabled={isUploadingProductPhoto || !userId}
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-sky-300/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isUploadingProductPhoto ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Package className="h-4 w-4" aria-hidden="true" />
                        )}
                        {isUploadingProductPhoto ? 'Uploading…' : 'Upload product photo'}
                      </button>
                    </div>
                  </div>

                  {archiveLoading && archiveProductImages.length === 0 ? (
                    <div className="grid min-h-[10rem] place-items-center text-zinc-500">
                      <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
                    </div>
                  ) : archiveProductImages.length === 0 ? (
                    <div className="grid min-h-[10rem] place-items-center rounded-2xl border border-dashed border-white/10 px-5 text-center">
                      <div>
                        <Package className="mx-auto h-8 w-8 text-zinc-600" aria-hidden="true" />
                        <p className="mt-3 text-sm font-medium text-zinc-300">No product photos yet</p>
                        <p className="mt-2 text-xs leading-5 text-zinc-600">
                          Upload a product image to store it here.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {archiveProductImages.map((img) => (
                        <article
                          key={img.id}
                          className={`flex flex-col gap-3 rounded-2xl border bg-white/[0.035] p-3 ${selectedArchiveIds.has(img.id) ? 'border-sky-400/60 ring-1 ring-sky-400/40' : 'border-white/10'}`}
                        >
                          <button
                            type="button"
                            onClick={() => setPreviewImageUrl(img.storage_path)}
                            aria-label="View image"
                            title="Click to view"
                            className="group relative aspect-square w-full shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-[#15171a] transition hover:border-white/30"
                          >
                            <img
                              src={img.storage_path}
                              alt="Product"
                              loading="lazy"
                              className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                            />
                            <span
                              role="presentation"
                              onClick={(e) => { e.stopPropagation(); toggleArchiveSelection(img.id) }}
                              className="absolute left-2 top-2 grid place-items-center rounded-md bg-black/50 p-1 backdrop-blur-sm"
                            >
                              <Checkbox
                                checked={selectedArchiveIds.has(img.id)}
                                aria-label="Select image"
                                className="pointer-events-none h-4 w-4"
                              />
                            </span>
                          </button>
                          {renamingProductId === img.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={renameProductValue}
                                onChange={(e) => setRenameProductValue(e.target.value)}
                                maxLength={100}
                                autoFocus
                                placeholder="Product name"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { void renameProductPhoto(img.id) }
                                  if (e.key === 'Escape') cancelRenameProduct()
                                }}
                                className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-sky-300/40"
                              />
                              <button
                                type="button"
                                onClick={() => { void renameProductPhoto(img.id) }}
                                aria-label="Save name"
                                title="Save"
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200"
                              >
                                <Check className="h-3 w-3" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelRenameProduct}
                                aria-label="Cancel"
                                title="Cancel"
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-rose-300/40 hover:bg-rose-300/10 hover:text-rose-200"
                              >
                                <X className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startRenameProduct(img)}
                              title="Rename product"
                              className="group flex items-center gap-1.5 text-left"
                            >
                              <span className={`truncate text-xs font-medium ${img.title ? 'text-zinc-200' : 'italic text-zinc-500'}`}>
                                {img.title || 'Untitled'}
                              </span>
                              <Pencil className="h-3 w-3 shrink-0 text-zinc-500 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                            </button>
                          )}
                          <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                            <span className="tabular-nums">{formatCreatedAt(img.created_at)}</span>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleUseImageAsStart(img.storage_path)}
                                aria-label="Use as Start frame"
                                title="Use as Start frame"
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-sky-300/40 hover:bg-sky-300/10 hover:text-sky-200"
                              >
                                <ImagePlus className="h-3 w-3" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                disabled={downloadingId === img.id}
                                onClick={() => { void downloadImageFile(img.id, img.storage_path) }}
                                aria-label="Download image"
                                title="Download image"
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200 disabled:opacity-60"
                              >
                                {downloadingId === img.id ? (
                                  <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                                ) : (
                                  <Download className="h-3 w-3" aria-hidden="true" />
                                )}
                              </button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label="Delete image permanently"
                                    title="Delete permanently"
                                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-rose-300/40 hover:bg-rose-300/10 hover:text-rose-200"
                                  >
                                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this image permanently?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently remove the image. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => { void handleDeleteUserImage(img.id) }}
                                      className="bg-rose-600 text-white hover:bg-rose-700"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )
            })() : archiveTab === 'audio' ? (() => {
              if (archiveLoading && archiveAudio.length === 0) {
                return (
                  <div className="grid min-h-[10rem] place-items-center text-zinc-500">
                    <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
                  </div>
                )
              }
              if (archiveAudio.length === 0) {
                return (
                  <div className="grid min-h-[10rem] place-items-center rounded-2xl border border-dashed border-white/10 px-5 text-center">
                    <div>
                      <Music2 className="mx-auto h-8 w-8 text-zinc-600" aria-hidden="true" />
                      <p className="mt-3 text-sm font-medium text-zinc-300">No audio yet</p>
                      <p className="mt-2 text-xs leading-5 text-zinc-600">
                        Music you upload and voiceovers you generate are saved here for download.
                      </p>
                    </div>
                  </div>
                )
              }
              return (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {archiveAudio.map((a) => (
                    <article
                      key={a.id}
                      className={`flex flex-col gap-3 rounded-2xl border bg-white/[0.035] p-4 ${selectedArchiveIds.has(a.id) ? 'border-sky-400/60 ring-1 ring-sky-400/40' : 'border-white/10'}`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedArchiveIds.has(a.id)}
                          onCheckedChange={() => toggleArchiveSelection(a.id)}
                          aria-label="Select audio"
                          className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-emerald-200">
                          {a.kind === 'voiceover'
                            ? <Mic className="h-4 w-4" aria-hidden="true" />
                            : <Music2 className="h-4 w-4" aria-hidden="true" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-200" title={a.name ?? undefined}>
                            {a.name || (a.kind === 'voiceover' ? 'Voiceover' : 'Music')}
                          </p>
                          <span className="mt-0.5 inline-flex items-center rounded-full border border-white/10 bg-black/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                            {a.kind === 'voiceover' ? 'Voiceover' : 'Music'}
                          </span>
                        </div>
                      </div>
                      {a.url ? (
                        <audio controls preload="none" src={a.url} className="w-full" />
                      ) : (
                        <p className="text-[11px] text-zinc-600">Preview unavailable</p>
                      )}
                      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                        <span className="tabular-nums">{formatCreatedAt(a.created_at)}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            disabled={downloadingId === a.id || !a.url}
                            onClick={() => { void downloadAudioFile(a.id, a.url, a.name) }}
                            aria-label="Download audio"
                            title="Download audio"
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200 disabled:opacity-60"
                          >
                            {downloadingId === a.id ? (
                              <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                            ) : (
                              <Download className="h-3 w-3" aria-hidden="true" />
                            )}
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                type="button"
                                aria-label="Delete audio permanently"
                                title="Delete permanently"
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-rose-300/40 hover:bg-rose-300/10 hover:text-rose-200"
                              >
                                <Trash2 className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this audio permanently?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently remove the audio file. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => { void handleDeleteUserAudio(a) }}
                                  className="bg-rose-600 text-white hover:bg-rose-700"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )
            })() : archiveTab === 'images' ? (() => {
              if (archiveLoading && archiveImages.length === 0) {
                return (
                  <div className="grid min-h-[10rem] place-items-center text-zinc-500">
                    <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
                  </div>
                )
              }
              if (archiveImages.length === 0) {
                return (
                  <div className="grid min-h-[10rem] place-items-center rounded-2xl border border-dashed border-white/10 px-5 text-center">
                    <div>
                      <ImageIcon className="mx-auto h-8 w-8 text-zinc-600" aria-hidden="true" />
                      <p className="mt-3 text-sm font-medium text-zinc-300">No images yet</p>
                      <p className="mt-2 text-xs leading-5 text-zinc-600">
                        Every image you generate or upload will be archived here with its date.
                      </p>
                    </div>
                  </div>
                )
              }
              return (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {archiveImages.map((img) => (
                    <article
                      key={img.id}
                      className={`flex flex-col gap-3 rounded-2xl border bg-white/[0.035] p-3 ${selectedArchiveIds.has(img.id) ? 'border-sky-400/60 ring-1 ring-sky-400/40' : 'border-white/10'}`}
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewImageUrl(img.storage_path)}
                        aria-label="View image"
                        title="Click to view"
                        className="group relative aspect-square w-full shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-[#15171a] transition hover:border-white/30"
                      >
                        <img
                          src={img.storage_path}
                          alt="Generated"
                          loading="lazy"
                          className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                        />
                        <span
                          role="presentation"
                          onClick={(e) => { e.stopPropagation(); toggleArchiveSelection(img.id) }}
                          className="absolute left-2 top-2 grid place-items-center rounded-md bg-black/50 p-1 backdrop-blur-sm"
                        >
                          <Checkbox
                            checked={selectedArchiveIds.has(img.id)}
                            aria-label="Select image"
                            className="pointer-events-none h-4 w-4"
                          />
                        </span>
                      </button>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                        <span className="tabular-nums">{formatCreatedAt(img.created_at)}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUseImageAsStart(img.storage_path)}
                            aria-label="Use as Start frame"
                            title="Use as Start frame"
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-sky-300/40 hover:bg-sky-300/10 hover:text-sky-200"
                          >
                            <ImagePlus className="h-3 w-3" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={downloadingId === img.id}
                            onClick={() => { void downloadImageFile(img.id, img.storage_path) }}
                            aria-label="Download image"
                            title="Download image"
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200 disabled:opacity-60"
                          >
                            {downloadingId === img.id ? (
                              <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                            ) : (
                              <Download className="h-3 w-3" aria-hidden="true" />
                            )}
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                type="button"
                                aria-label="Delete image permanently"
                                title="Delete permanently"
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-rose-300/40 hover:bg-rose-300/10 hover:text-rose-200"
                              >
                                <Trash2 className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this image permanently?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently remove the image. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => { void handleDeleteUserImage(img.id) }}
                                  className="bg-rose-600 text-white hover:bg-rose-700"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )
            })() : (() => {
              const videoByJob = new Map<string, VideoSummary>()
              for (const v of archiveVideos) {
                if (!videoByJob.has(v.job_id)) videoByJob.set(v.job_id, v)
              }
              const entries = [...archiveJobs].sort(
                (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
              )

              if (archiveLoading && entries.length === 0) {
                return (
                  <div className="grid min-h-[10rem] place-items-center text-zinc-500">
                    <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
                  </div>
                )
              }

              if (entries.length === 0) {
                return (
                  <div className="grid min-h-[10rem] place-items-center rounded-2xl border border-dashed border-white/10 px-5 text-center">
                    <div>
                      <Database className="mx-auto h-8 w-8 text-zinc-600" aria-hidden="true" />
                      <p className="mt-3 text-sm font-medium text-zinc-300">No films yet</p>
                      <p className="mt-2 text-xs leading-5 text-zinc-600">
                        Every film you generate will be archived here with its date.
                      </p>
                    </div>
                  </div>
                )
              }

              const statusBadge = (status: string) => {
                if (status === 'completed') {
                  return (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                      Ready
                    </span>
                  )
                }
                if (status === 'failed' || status === 'cancelled') {
                  return (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/30 bg-rose-300/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
                      Failed
                    </span>
                  )
                }
                return (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                    <LoaderCircle className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
                    Rendering
                  </span>
                )
              }

              return (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {entries.map((job) => {
                    const video = videoByJob.get(job.id)
                    return (
                      <article
                        key={job.id}
                        className={`flex flex-col gap-3 rounded-2xl border bg-white/[0.035] p-3 ${selectedArchiveIds.has(job.id) ? 'border-sky-400/60 ring-1 ring-sky-400/40' : 'border-white/10'}`}
                      >
                        <div
                          className={`group relative aspect-video w-full shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#15171a] ${video?.storage_path ? 'cursor-pointer' : ''}`}
                          role={video?.storage_path ? 'button' : undefined}
                          tabIndex={video?.storage_path ? 0 : undefined}
                          onClick={() => {
                            if (video?.storage_path) {
                              setPlayerFilm({
                                jobId: job.id,
                                storagePath: video.storage_path,
                                poster: video.thumbnail_url ?? null,
                                title: job.input_prompt,
                              })
                            }
                          }}
                          onKeyDown={(event) => {
                            if (video?.storage_path && (event.key === 'Enter' || event.key === ' ')) {
                              event.preventDefault()
                              setPlayerFilm({
                                jobId: job.id,
                                storagePath: video.storage_path,
                                poster: video.thumbnail_url ?? null,
                                title: job.input_prompt,
                              })
                            }
                          }}
                        >
                          {video?.storage_path ? (
                            <>
                              <PlayableVideo
                                thumbnail
                                className="h-full w-full bg-black object-cover"
                                src={getCardVideoSrc(job.id, video.storage_path)}
                                poster={video.thumbnail_url ?? undefined}
                                muted
                                playsInline
                                preload="metadata"
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
                              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                                <span className="grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm transition group-hover:bg-black/60">
                                  <Play className="h-5 w-5" aria-hidden="true" />
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="grid h-full w-full place-items-center text-zinc-500">
                              <Clapperboard className="h-6 w-6" aria-hidden="true" />
                            </div>
                          )}
                          <span
                            role="presentation"
                            onClick={(e) => { e.stopPropagation(); toggleArchiveSelection(job.id) }}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="absolute left-2 top-2 grid place-items-center rounded-md bg-black/50 p-1 backdrop-blur-sm"
                          >
                            <Checkbox
                              checked={selectedArchiveIds.has(job.id)}
                              aria-label="Select film"
                              className="pointer-events-none h-4 w-4"
                            />
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 min-w-0 flex-1 text-xs font-medium leading-5 text-zinc-200">
                              {job.input_prompt}
                            </p>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {job.status === 'completed' && video?.storage_path ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={downloadingId === job.id}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      if (!video) return
                                      void downloadDirect(job.id, video.storage_path, 'film')
                                    }}
                                    aria-label="Download video (fast)"
                                    title="Download (fast)"
                                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200 disabled:opacity-60"
                                  >
                                    {downloadingId === job.id ? (
                                      <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                                    ) : (
                                      <Download className="h-3 w-3" aria-hidden="true" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={downloadingId === job.id}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      if (!video) return
                                      void downloadAsMp4(job.id, video.storage_path, 'film')
                                    }}
                                    aria-label="Download as MP4 (converted)"
                                    title="Download as MP4"
                                    className="grid h-6 shrink-0 place-items-center rounded-full border border-white/10 px-1.5 text-[9px] font-semibold leading-none text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200 disabled:opacity-60"
                                  >
                                    MP4
                                  </button>
                                </>
                              ) : null}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button
                                    type="button"
                                    disabled={deletingArchiveId === job.id}
                                    onClick={(event) => event.stopPropagation()}
                                    aria-label="Delete video permanently"
                                    title="Delete permanently"
                                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-rose-300/40 hover:bg-rose-300/10 hover:text-rose-200 disabled:opacity-60"
                                  >
                                    {deletingArchiveId === job.id ? (
                                      <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                                    ) : (
                                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                                    )}
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this film permanently?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently remove the film and its files. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => { void handleDeleteArchiveJob(job.id) }}
                                      className="bg-rose-600 text-white hover:bg-rose-700"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>

                          </div>
                          <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                            {statusBadge(job.status)}
                            <span className="tabular-nums">{formatCreatedAt(job.created_at)}</span>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!playerFilm}
        onOpenChange={(next) => { if (!next) setPlayerFilm(null) }}
      >
        <DialogContent className="z-[60] w-[min(60rem,95vw)] max-w-none border-white/10 bg-[#0b0c0e]/95 p-0 text-zinc-100 shadow-[0_22px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <DialogHeader className="border-b border-white/10 px-5 py-3">
            <DialogTitle className="line-clamp-1 pr-8 text-sm font-medium text-zinc-200">
              {playerFilm?.title ?? 'Film'}
            </DialogTitle>
          </DialogHeader>
          <div className="bg-black">
            {playerFilm ? (
              <PlayableVideo
                className="aspect-video h-auto w-full bg-black object-contain"
                src={getCardVideoSrc(playerFilm.jobId, playerFilm.storagePath)}
                poster={playerFilm.poster ?? undefined}
                controls
                autoPlay
                playsInline
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>



      <CalendarInfoDialog
        open={isCalendarOpen}
        onOpenChange={setIsCalendarOpen}
        todayOnly={false}
        onApplyPrompt={(p) => {
          setPromptText(p)
          setDurationSeconds(10)
          setIsCalendarOpen(false)
        }}
      />





      <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 sm:top-5">
      {(() => {
        const hasReadyClips = playableSequenceClips.length > 0
        return (
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
            className={`relative flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs uppercase tracking-[0.18em] transition ${
              hasReadyClips
                ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-100 shadow-[0_0_18px_-4px_rgba(16,185,129,0.7)] hover:border-emerald-300/60 hover:bg-emerald-400/25'
                : 'border-white/10 bg-white/[0.04] text-zinc-400/70'
            }`}
            aria-label="Connect all cards into one continuous preview"
            title="Connect all cards into one continuous preview"
          >
            {hasReadyClips ? (
              <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-emerald-400/50 animate-ping" aria-hidden="true" />
            ) : null}
            <Play className={`relative h-[14px] w-[14px] ${hasReadyClips ? 'animate-pulse' : ''}`} aria-hidden="true" />
            <span className="relative">Preview</span>
          </button>
        )
      })()}
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

      {!isReadOnlyProject && (
      <>
      {isMerging ? (
        <div className="flex h-9 items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs uppercase tracking-[0.18em] text-zinc-200/80">
          <LoaderCircle className="h-[14px] w-[14px] animate-spin" aria-hidden="true" />
          <span className="tabular-nums px-1">
            {mergeStage === 'encoding' ? 'Encoding ' : mergeStage === 'uploading' ? 'Uploading ' : mergeStage === 'finalizing' ? 'Finalizing ' : ''}
            {mergeProgress}%
          </span>
          <button
            type="button"
            onClick={() => { mergeAbortRef.current?.abort() }}
            className="ml-1 grid h-6 w-6 place-items-center rounded text-zinc-300 transition hover:bg-red-500/20 hover:text-red-200"
            aria-label="Cancel rendering"
            title="Cancel rendering"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleMergeAllVideos}
          disabled={(Math.max(completedSourceVideos.length, selectedProjectId ? (projectSourceJobs[selectedProjectId]?.length ?? 0) : 0) + visibleUserImages.length) < 1}
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
          <Film className="h-[14px] w-[14px]" aria-hidden="true" />
          <span>Final film</span>
        </button>
      )}


      {/* Background music: pick an audio file + select a window. Applied as
          the soundtrack of the Final Film (clip audio is muted). */}
      <input
        ref={musicFileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleMusicFileChange}
      />
      {musicUrl ? (
        <button
          type="button"
          onClick={handleMusicButtonClick}
          className="flex h-9 max-w-[220px] items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs uppercase tracking-[0.18em] text-zinc-200/80 transition hover:border-amber-300/30 hover:bg-amber-300/[0.06] hover:text-amber-100"
          aria-label="Edit soundtrack"
          title="Edit soundtrack"
        >
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
        </button>
      ) : (
        <button
          type="button"
          onClick={() => musicFileInputRef.current?.click()}
          className="flex h-9 max-w-[220px] items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs uppercase tracking-[0.18em] text-zinc-200/80 transition hover:border-amber-300/30 hover:bg-amber-300/[0.06] hover:text-amber-100"
          aria-label="Add soundtrack"
          title="Upload a music file as soundtrack for the Final Film"
        >
          <Music className="h-[14px] w-[14px]" aria-hidden="true" />
          <span>Music</span>
        </button>
      )}

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
          <PopoverContent className="w-96 space-y-4 border-white/10 bg-zinc-950 text-zinc-100" align="end">
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

            {voiceoverUrl ? (
              <SoundtrackWaveform
                ref={voiceoverWaveformRef}
                url={voiceoverUrl}
                range={voiceoverRange[1] > voiceoverRange[0] ? voiceoverRange : [0, Math.max(0.1, voiceoverDuration)]}
                onReady={(d) => {
                  setVoiceoverDuration(d)
                  if (voiceoverRange[1] <= voiceoverRange[0]) setVoiceoverRange([0, d])
                }}
                onRangeChange={(r) => { if (r[1] > r[0]) setVoiceoverRange([r[0], r[1]]) }}
              />
            ) : null}

            <div className="space-y-3 rounded-md border border-white/10 bg-black/40 p-3">
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span className="font-medium">Play on video from … to</span>
                <span className="tabular-nums text-zinc-200">
                  {formatTimeMS(voiceoverTimeline[0])} – {formatTimeMS(voiceoverTimeline[1] > voiceoverTimeline[0] ? voiceoverTimeline[1] : mergedDurationSec)}
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Start</span>
                  <span className="tabular-nums text-zinc-200">{formatTimeMS(voiceoverTimeline[0])}</span>
                </div>
                <Slider
                  value={[Math.round(voiceoverTimeline[0])]}
                  min={0}
                  max={mergedDurationSec}
                  step={1}
                  onValueChange={(v) => {
                    const s = Math.min(v[0] ?? 0, (voiceoverTimeline[1] || mergedDurationSec) - 1)
                    setVoiceoverTimeline([Math.max(0, s), voiceoverTimeline[1] || mergedDurationSec])
                  }}
                />
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>End</span>
                  <span className="tabular-nums text-zinc-200">{formatTimeMS(voiceoverTimeline[1] > voiceoverTimeline[0] ? voiceoverTimeline[1] : mergedDurationSec)}</span>
                </div>
                <Slider
                  value={[Math.round(voiceoverTimeline[1] > voiceoverTimeline[0] ? voiceoverTimeline[1] : mergedDurationSec)]}
                  min={0}
                  max={mergedDurationSec}
                  step={1}
                  onValueChange={(v) => {
                    const e = Math.max(v[0] ?? mergedDurationSec, voiceoverTimeline[0] + 1)
                    setVoiceoverTimeline([voiceoverTimeline[0], Math.min(mergedDurationSec, e)])
                  }}
                />
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Outside this window the voiceover is silent. Total film ≈ {formatTimeMS(mergedDurationSec)}.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
      </>
      )}
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
          if (aiDialogMode === 'cover') {
            if (!coverScopeKey) {
              setVideoColumnMessage('Open or create a project first — covers attach to a specific project.')
              setAiDialogMode('frame')
              return
            }
            // Pin this image as the film cover for the current scope.
            // Do NOT stage it as a Start frame, do NOT add it to the regular
            // pending source-image list (it's excluded via allCoverImageIds).
            setUserImages((prev) => {
              if (prev.some((p) => p.id === row.id)) return prev
              return [row as UserImageItem, ...prev]
            })
            setCoverImages((prev) => {
              const next = { ...prev, [coverScopeKey]: row as UserImageItem }
              persistCoverImages(next)
              return next
            })
            setAiDialogMode('frame')
            return
          }

          setUserImages((prev) => [row as UserImageItem, ...prev])
          markNewImage((row as UserImageItem).id)
          {
            const gid = ensureActiveDraftGroupId()
            if (gid) {
              void supabase
                .from('generator_user_images')
                .update({ draft_group_id: gid })
                .eq('id', (row as UserImageItem).id)
            }
          }
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
        defaultDuration={durationSeconds === 30 || durationSeconds === 45 || durationSeconds === 135 ? durationSeconds : (durationSeconds as 5 | 10 | 15)}
        userId={userId}
        onUseAsPrompt={(text, imageUrl) => {
          setPromptText(text)
          if (imageUrl) {
            setUploadTarget('Start')
            void handleUseImageAsStart(imageUrl)
          }
        }}
        onSendScenes={async (scenes, imageUrl) => {
          const tagged = scenes
            .map((s, i) => `=== Scene ${i + 1} ===\n${s.trim()}`)
            .join('\n\n')
          setPromptText(tagged)
          if (imageUrl) {
            setUploadTarget('Start')
            await handleUseImageAsStart(imageUrl)
          }
        }}
      />

      <ProductAdDialog
        open={isProductAdOpen}
        onOpenChange={setIsProductAdOpen}
        defaultDuration={durationSeconds === 30 || durationSeconds === 45 || durationSeconds === 135 ? durationSeconds : (durationSeconds as 5 | 10 | 15)}
        userId={userId}
        onUseAsPrompt={(text, imageUrl) => {
          setPromptText(text)
          if (imageUrl) {
            setUploadTarget('Start')
            void handleUseImageAsStart(imageUrl)
          }
        }}
        onSendScenes={async (scenes, imageUrl) => {
          const tagged = scenes
            .map((s, i) => `=== Scene ${i + 1} ===\n${s.trim()}`)
            .join('\n\n')
          setPromptText(tagged)
          if (imageUrl) {
            setUploadTarget('Start')
            await handleUseImageAsStart(imageUrl)
          }
        }}
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

            {/* Placement on the video timeline */}
            <div className="space-y-3 rounded-md border border-white/10 bg-black/40 p-3">
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span className="font-medium">Play on video from … to</span>
                <span className="tabular-nums text-zinc-200">
                  {formatTimeMS(musicTimeline[0])} – {formatTimeMS(musicTimeline[1] > musicTimeline[0] ? musicTimeline[1] : mergedDurationSec)}
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Start</span>
                  <span className="tabular-nums text-zinc-200">{formatTimeMS(musicTimeline[0])}</span>
                </div>
                <Slider
                  value={[Math.round(musicTimeline[0])]}
                  min={0}
                  max={mergedDurationSec}
                  step={1}
                  onValueChange={(v) => {
                    const s = Math.min(v[0] ?? 0, (musicTimeline[1] || mergedDurationSec) - 1)
                    setMusicTimeline([Math.max(0, s), musicTimeline[1] || mergedDurationSec])
                  }}
                />
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>End</span>
                  <span className="tabular-nums text-zinc-200">{formatTimeMS(musicTimeline[1] > musicTimeline[0] ? musicTimeline[1] : mergedDurationSec)}</span>
                </div>
                <Slider
                  value={[Math.round(musicTimeline[1] > musicTimeline[0] ? musicTimeline[1] : mergedDurationSec)]}
                  min={0}
                  max={mergedDurationSec}
                  step={1}
                  onValueChange={(v) => {
                    const e = Math.max(v[0] ?? mergedDurationSec, musicTimeline[0] + 1)
                    setMusicTimeline([musicTimeline[0], Math.min(mergedDurationSec, e)])
                  }}
                />
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Outside this window the music is silent. Total film ≈ {formatTimeMS(mergedDurationSec)}.
              </p>
            </div>


            {/* Audio mode: music-only vs mix */}
            <div className="space-y-3 rounded-md border border-white/10 bg-black/40 p-3">
              <div className="flex items-center">
                <div
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-emerald-500/60 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-200"
                >
                  <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
                  <span>Mix audio</span>
                </div>
              </div>

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
              musicTimeline={musicTimeline}
              voiceoverUrl={voiceoverUrl}
              voiceoverVolume={voiceoverVolume}
              voiceoverRange={voiceoverRange}
              voiceoverTimeline={voiceoverTimeline}
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
                width: 'fit-content',
                maxWidth: 'calc(100vw - 56rem)',
                maxHeight: `${previewMaxHeightPx}px`,
              }}
            >
              {previewItem.job.video?.storage_path ? (() => {
                const src = getCardVideoSrc(previewItem.job.id, previewItem.job.video.storage_path) ?? previewItem.job.video.storage_path
                return (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={closePreview}
                      aria-label="Close preview"
                      title="Close preview"
                      className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/60 text-zinc-200 backdrop-blur transition hover:border-rose-300/40 hover:bg-rose-500/20 hover:text-rose-100"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <VideoWithSoundtrack
                      videoKey={`${previewItem.job.id}:${src}`}
                      videoBoxClassName="overflow-hidden bg-black"
                      videoBoxStyle={{
                        aspectRatio: ratioToCss(getRatioFor(previewItem.job)),
                        height: ratioToHeight(getRatioFor(previewItem.job)),
                        maxHeight: `${previewMaxHeightPx}px`,
                        maxWidth: 'calc(100vw - 56rem)',
                      }}
                      className="h-full w-full bg-black object-contain"
                      src={src}
                      controls
                      playsInline
                      preload="metadata"
                      clipVolume={1}
                    />
                  </div>
                )
              })() : (
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
                              {previewItem.job.status_message
                                ?? (longRender
                                  ? 'Still rendering — provider is taking longer than usual.'
                                  : `About ${Math.max(0, 100 - pct)}% remaining`)}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs leading-5 text-zinc-600">
                              {previewItem.job.status_message ?? 'Waiting for render output.'}
                            </p>
                          )}
                          {isRendering && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm('Cancel this rendering job?')) {
                                  void deleteCard(previewItem.job.id)
                                }
                              }}
                              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-zinc-300 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Cancel rendering</span>
                            </button>
                          )}

                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}
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
          {!isReadOnlyProject && (
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
            <button
              type="button"
              onClick={() => { setAiDialogMode('cover'); setIsAiImageDialogOpen(true) }}
              disabled={!coverScopeKey}
              className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-[#141518]/95 text-zinc-300 transition hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/10 disabled:hover:bg-[#141518]/95 disabled:hover:text-zinc-300"
              aria-label="Generate film cover with AI"
              title={coverScopeKey ? 'Generate film cover with AI' : 'Open or create a project first'}
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
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
          </div>

          )}
        </div>

        {videoColumnMessage ? (
          <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-100">
            {videoColumnMessage}
          </div>
        ) : null}

        <div className="mt-3 flex-1 overflow-y-auto overflow-x-hidden pr-1">
          {currentCover ? (
            <div className="mb-3">
              <article
                className="w-full min-w-0 rounded-2xl border border-amber-300/30 bg-amber-300/[0.04] p-3 shadow-[0_8px_30px_rgba(252,211,77,0.08)]"
                aria-label="Film cover"
              >
                <div
                  className="relative w-full min-w-0 overflow-hidden rounded-xl border border-amber-300/20 bg-[#15171a]"
                  style={{ aspectRatio: (lockedProjectRatio ?? aspectRatio) === '9:16' ? '9 / 16' : (lockedProjectRatio ?? aspectRatio) === '16:9' ? '16 / 9' : '1 / 1' }}
                >
                  <img
                    src={currentCover.storage_path}
                    alt="Film cover"
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-amber-300/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-950 shadow-md">
                    Cover
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-amber-100">
                    Film cover
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setAiDialogMode('cover'); setIsAiImageDialogOpen(true) }}
                      className="inline-flex h-7 items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2 text-[11px] font-medium text-zinc-200 transition hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-100"
                      aria-label="Regenerate cover"
                      title="Regenerate cover"
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden="true" />
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCoverImages((prev) => {
                          const next = { ...prev }
                          delete next[coverScopeKey]
                          persistCoverImages(next)
                          return next
                        })
                      }}
                      className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-black/30 text-zinc-400 transition hover:border-rose-300/40 hover:bg-rose-300/10 hover:text-rose-200"
                      aria-label="Remove cover"
                      title="Remove cover"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            </div>
          ) : null}
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
                        draggable={!isReadOnlyProject}
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
                          style={{ aspectRatio: ratioToCss(lockedProjectRatio ?? aspectRatio) }}
                        >
                          <img
                            src={img.storage_path}
                            alt="Uploaded reference"
                            className="h-full w-full object-contain"
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
                          {!isReadOnlyProject && (
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
                                handleUseImageAsStart(img.storage_path)
                              }}
                              aria-label="Use as Start frame"
                              title="Use as Start frame"
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:border-sky-300/40 hover:bg-sky-300/10 hover:text-sky-200"
                            >
                              <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
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
                          )}
                        </div>
                        <div
                          className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-2">
                            <label htmlFor={`img-dur-${img.id}`}>Duration</label>
                            <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-semibold text-zinc-200">
                              <ImageDurationInput
                                id={`img-dur-${img.id}`}
                                value={img.still_duration_seconds || 3}
                                onCommit={(sec) => updateImageDuration(img.id, sec)}
                              />
                              <span className="text-zinc-500">s</span>
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
                    draggable={!isReadOnlyProject}
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
                          thumbnail
                          className="h-full w-full max-w-full bg-black object-contain"
                          src={getCardVideoSrc(video.id, video.video.storage_path)}
                          poster={video.video.thumbnail_url ?? undefined}
                          controls
                          muted
                          playsInline
                          preload="metadata"
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
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          if (isReadOnlyProject || video.id.startsWith('merged-')) {
                            setPromptViewer(video.input_prompt)
                          } else {
                            setEditPromptText(video.input_prompt ?? '')
                            setEditPromptJob(video)
                          }
                        }}
                        title={isReadOnlyProject ? video.input_prompt : 'Edit prompt & regenerate'}
                        className="max-h-12 min-w-0 flex-1 cursor-pointer overflow-hidden whitespace-normal break-words text-left text-sm font-medium leading-6 text-zinc-200 transition hover:text-zinc-50"
                      >
                        {video.input_prompt}
                      </button>
                      {!isReadOnlyProject && (
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
                        {!video.id.startsWith('merged-') ? (
                          (() => {
                            const isRegenerating = regeneratingIds.has(video.id)
                            const hasFrame = Boolean(video.first_frame_url || video.last_frame_url)
                            const mode: 't2v' | 'i2v' = hasFrame ? 'i2v' : 't2v'
                            const choices = MODEL_CHOICES.filter((c) => c.supports.includes(mode))
                            const currentModel = video.model_key
                            return (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    disabled={isRegenerating}
                                    onClick={(event) => event.stopPropagation()}
                                    aria-label="Regenerate this card"
                                    title="Regenerate this card — choose provider"
                                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:border-sky-300/40 hover:bg-sky-300/10 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    <RefreshCw
                                      className={`h-3.5 w-3.5 ${isRegenerating ? 'animate-spin' : ''}`}
                                      aria-hidden="true"
                                    />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-64">
                                  <DropdownMenuLabel>Regenerate with…</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {choices.length === 0 ? (
                                    <DropdownMenuItem disabled>No compatible provider</DropdownMenuItem>
                                  ) : (
                                    choices.map((choice) => {
                                      const isCurrent = choice.model === currentModel
                                      return (
                                        <DropdownMenuItem
                                          key={choice.id}
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            regenerateCard(video, {
                                              providerKey: choice.providerKey,
                                              requestedModel: choice.model,
                                            })
                                          }}
                                          className="flex flex-col items-start gap-0.5"
                                        >
                                          <span className="text-sm">
                                            {choice.label}
                                            {isCurrent ? (
                                              <span className="ml-1 text-[10px] text-emerald-300">(Current)</span>
                                            ) : null}
                                          </span>
                                          <span className="text-[11px] text-zinc-400">{choice.description}</span>
                                        </DropdownMenuItem>
                                      )
                                    })
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )
                          })()
                        ) : null}
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
                        {(video.video?.storage_path || editedClips[video.id]?.url) ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setV2vJobId(video.id)
                            }}
                            aria-label="Video-to-Video Editing"
                            title="Video-to-Video Editing (AI prompt)"
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-rose-400/40 bg-rose-500/15 text-rose-300 transition hover:border-rose-300/60 hover:bg-rose-500/30 hover:text-rose-100"
                          >
                            <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
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
                      )}
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
        className={`fixed bottom-3 left-3 top-3 z-40 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col rounded-[22px] border border-white/10 bg-[#0b0c0e]/95 p-3 shadow-[0_22px_70px_rgba(0,0,0,0.4)] backdrop-blur-xl transition duration-300 sm:bottom-5 sm:left-16 sm:top-5 sm:w-96 lg:w-[26rem] xl:w-[30rem] 2xl:w-[34rem] ${
          isApprovedPanelOpen
            ? 'pointer-events-auto visible translate-x-0 opacity-100'
            : 'pointer-events-none invisible -translate-x-[calc(100%+1.25rem)] opacity-0'
        }`}
        aria-label="Library"
        aria-hidden={!isApprovedPanelOpen}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3 pt-12 sm:pt-14">
          <div className="inline-flex items-center gap-2">
            <Library className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Library</p>
            <span className="grid h-5 min-w-5 place-items-center rounded-full border border-white/10 bg-white/[0.04] px-1.5 text-[11px] font-semibold text-zinc-300">
              {libraryItems.length}
            </span>
          </div>
          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100"
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
            const renderCard = (video: JobDetail, variant: 'final' | 'draft') => {
              const isPreviewSelected = previewVideo?.id === video.id
              // For drafts, resolve the real preview from the snapshot maps so
              // a stale/empty entry.video never shows a blank card.
              const display =
                variant === 'draft'
                  ? resolveDraftDisplay(video.id, video).video
                  : video.video
              const selectMode = variant === 'final' ? finalSelectMode : draftSelectMode
              const isChecked = (variant === 'final' ? selectedFinalIds : selectedDraftIds).has(video.id)
              return (
                <article
                  key={video.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-2.5 transition hover:border-white/20 hover:bg-white/[0.055] ${
                    selectMode && isChecked
                      ? 'border-rose-300/40 bg-rose-300/[0.06]'
                      : isPreviewSelected ? 'border-emerald-300/30 bg-emerald-300/[0.04]' : 'border-white/10 bg-white/[0.035]'
                  }`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Preview ${video.input_prompt}`}
                  onClick={() => {
                    if (selectMode) toggleSelectId(variant, video.id)
                    else openLibraryEntry(video)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      if (selectMode) toggleSelectId(variant, video.id)
                      else openLibraryEntry(video)
                    }
                  }}
                >
                  {selectMode ? (
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); toggleSelectId(variant, video.id) }}
                      aria-label={isChecked ? 'Deselect' : 'Select'}
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
                        isChecked ? 'border-rose-300/60 bg-rose-300/20 text-rose-200' : 'border-white/20 text-zinc-500'
                      }`}
                    >
                      {isChecked ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                    </button>
                  ) : null}
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#15171a]">
                    {display?.storage_path ? (
                      <PlayableVideo
                        thumbnail
                        className="h-full w-full bg-black object-cover"
                        src={getCardVideoSrc(video.id, display.storage_path)}
                        poster={display.thumbnail_url ?? undefined}
                        muted
                        playsInline
                        preload="metadata"
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
                        {variant === 'final' && video.video?.storage_path ? (
                          <>
                            <button
                              type="button"
                              disabled={downloadingId === video.id}
                              onClick={(event) => {
                                event.stopPropagation()
                                // Fast direct download (no in-browser transcode).
                                void downloadDirect(video.id, video.video!.storage_path, 'final-film')
                              }}
                              aria-label="Download video (fast)"
                              title="Download (fast)"
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200 disabled:opacity-60"
                            >
                              {downloadingId === video.id ? (
                                <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <Download className="h-3 w-3" aria-hidden="true" />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={downloadingId === video.id}
                              onClick={(event) => {
                                event.stopPropagation()
                                // Compatibility path: transcode WebM → standard MP4.
                                void downloadAsMp4(video.id, video.video!.storage_path, 'final-film')
                              }}
                              aria-label="Download as MP4 (converted)"
                              title="Download as MP4"
                              className="grid h-6 shrink-0 place-items-center rounded-full border border-white/10 px-1.5 text-[9px] font-semibold leading-none text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200 disabled:opacity-60"
                            >
                              MP4
                            </button>
                          </>
                        ) : null}
                        {variant === 'final' ? (() => {
                          const audio = projectAudio[video.id]
                          const hasAny = Boolean(audio?.music || audio?.voiceover)
                          return (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(event) => event.stopPropagation()}
                                  aria-label="Project audio"
                                  title="Music & voiceover"
                                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition ${
                                    hasAny
                                      ? 'border-white/10 text-zinc-400 hover:border-sky-300/40 hover:bg-sky-300/10 hover:text-sky-200'
                                      : 'border-white/10 text-zinc-600 hover:border-white/20 hover:text-zinc-400'
                                  }`}
                                >
                                  <Music2 className="h-3 w-3" aria-hidden="true" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="end"
                                className="w-72 space-y-3"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                                  Project audio
                                </p>
                                {!hasAny ? (
                                  <p className="text-xs text-zinc-500">
                                    No music or voiceover for this project.
                                  </p>
                                ) : (
                                  <div className="space-y-3">
                                    {audio?.music ? (
                                      <div className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-200">
                                            <Music2 className="h-3 w-3" aria-hidden="true" /> Music
                                          </span>
                                          <button
                                            type="button"
                                            disabled={downloadingId === `music-${video.id}`}
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              void downloadAudioFile(`music-${video.id}`, audio.music!.url, audio.music!.name)
                                            }}
                                            aria-label="Download music"
                                            title="Download music"
                                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200 disabled:opacity-60"
                                          >
                                            {downloadingId === `music-${video.id}` ? (
                                              <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                                            ) : (
                                              <Download className="h-3 w-3" aria-hidden="true" />
                                            )}
                                          </button>
                                        </div>
                                        <p className="truncate text-[11px] text-zinc-500">{audio.music.name}</p>
                                        <audio controls preload="none" src={audio.music.url} className="h-8 w-full" />
                                      </div>
                                    ) : null}
                                    {audio?.voiceover ? (
                                      <div className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                                            <Mic className="h-3 w-3" aria-hidden="true" /> Voiceover
                                          </span>
                                          <button
                                            type="button"
                                            disabled={downloadingId === `voice-${video.id}`}
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              void downloadAudioFile(`voice-${video.id}`, audio.voiceover!.url, audio.voiceover!.name)
                                            }}
                                            aria-label="Download voiceover"
                                            title="Download voiceover"
                                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200 disabled:opacity-60"
                                          >
                                            {downloadingId === `voice-${video.id}` ? (
                                              <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                                            ) : (
                                              <Download className="h-3 w-3" aria-hidden="true" />
                                            )}
                                          </button>
                                        </div>
                                        <p className="truncate text-[11px] text-zinc-500">{audio.voiceover.name}</p>
                                        <audio controls preload="none" src={audio.voiceover.url} className="h-8 w-full" />
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                              </PopoverContent>
                            </Popover>
                          )
                        })() : null}
                        {variant === 'final' && video.video?.storage_path ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              void runCopyrightCheck(video)
                            }}
                            aria-label="Copyright check"
                            title="Copyright check"
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-violet-300/40 hover:bg-violet-300/10 hover:text-violet-200"
                          >
                            <Shield className="h-3 w-3" aria-hidden="true" />
                          </button>
                        ) : null}
                        {variant === 'final' ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              reopenFinalAsDraft(video)
                            }}
                            aria-label="Reopen for editing"
                            title="Reopen for editing"
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-200"
                          >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
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
                      {variant === 'final' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <BookmarkCheck className="h-3 w-3 text-emerald-300" aria-hidden="true" />
                          Saved
                        </span>
                      ) : (() => {
                        const clipCount = (draftSourceJobs[video.id]?.length ?? 0) + (draftSourceImages[video.id]?.length ?? 0)
                        return (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                            Draft{clipCount > 0 ? ` · ${clipCount} clip${clipCount === 1 ? '' : 's'}` : ''}
                          </span>
                        )
                      })()}
                      <span className="tabular-nums">{formatCreatedAt(video.created_at)}</span>
                    </div>
                  </div>
                </article>
              )
            }

            if (finalizedItems.length === 0 && draftItems.length === 0) {
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
              <div className="grid gap-5">
                <section className="grid gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Final videos</h3>
                    <span className="grid h-5 min-w-5 place-items-center rounded-full border border-white/10 px-1.5 text-[10px] font-semibold text-zinc-300">
                      {finalizedItems.length}
                    </span>
                    {finalizedItems.length > 0 ? (
                      <div className="ml-auto flex items-center gap-1.5">
                        {finalSelectMode ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setSelectedFinalIds((prev) => prev.size === finalizedItems.length ? new Set() : new Set(finalizedItems.map((v) => v.id)))}
                              className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
                            >
                              {selectedFinalIds.size === finalizedItems.length ? 'Deselect all' : 'Select all'}
                            </button>
                            <button
                              type="button"
                              disabled={selectedFinalIds.size === 0}
                              onClick={() => void bulkDeleteSelected('final')}
                              className="inline-flex items-center gap-1 rounded-full border border-rose-300/30 bg-rose-300/10 px-2 py-1 text-[10px] font-semibold text-rose-200 transition hover:bg-rose-300/20 disabled:opacity-40"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                              Delete ({selectedFinalIds.size})
                            </button>
                            <button
                              type="button"
                              onClick={() => { setFinalSelectMode(false); setSelectedFinalIds(new Set()) }}
                              aria-label="Cancel selection"
                              className="grid h-6 w-6 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-white/20 hover:text-zinc-100"
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setFinalSelectMode(true)}
                            aria-label="Select final videos"
                            title="Select multiple to delete"
                            className="grid h-6 w-6 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-white/20 hover:text-zinc-100"
                          >
                            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {finalizedItems.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-[11px] text-zinc-500">
                      No final videos yet. Use Final Film to merge clips.
                    </p>
                  ) : (
                    <div className="grid gap-3">
                      {finalizedItems.map((v) => renderCard(v, 'final'))}
                    </div>
                  )}
                </section>

                <section className="grid gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Drafts</h3>
                    <span className="grid h-5 min-w-5 place-items-center rounded-full border border-white/10 px-1.5 text-[10px] font-semibold text-zinc-300">
                      {draftItems.length}
                    </span>
                    {draftItems.length > 0 ? (
                      <div className="ml-auto flex items-center gap-1.5">
                        {draftSelectMode ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setSelectedDraftIds((prev) => prev.size === draftItems.length ? new Set() : new Set(draftItems.map((v) => v.id)))}
                              className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
                            >
                              {selectedDraftIds.size === draftItems.length ? 'Deselect all' : 'Select all'}
                            </button>
                            <button
                              type="button"
                              disabled={selectedDraftIds.size === 0}
                              onClick={() => void bulkDeleteSelected('draft')}
                              className="inline-flex items-center gap-1 rounded-full border border-rose-300/30 bg-rose-300/10 px-2 py-1 text-[10px] font-semibold text-rose-200 transition hover:bg-rose-300/20 disabled:opacity-40"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                              Delete ({selectedDraftIds.size})
                            </button>
                            <button
                              type="button"
                              onClick={() => { setDraftSelectMode(false); setSelectedDraftIds(new Set()) }}
                              aria-label="Cancel selection"
                              className="grid h-6 w-6 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-white/20 hover:text-zinc-100"
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDraftSelectMode(true)}
                            aria-label="Select drafts"
                            title="Select multiple to delete"
                            className="grid h-6 w-6 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-white/20 hover:text-zinc-100"
                          >
                            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {draftItems.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-[11px] text-zinc-500">
                      No drafts. Saved clips that aren't merged yet show here.
                    </p>
                  ) : (
                    <div className="grid gap-3">
                      {draftItems.map((v) => renderCard(v, 'draft'))}
                    </div>
                  )}
                </section>
              </div>
            )
          })()}
        </div>
      </aside>





      {!isReadOnlyProject && (
      <form
        ref={composerRef}
        className="fixed bottom-4 left-1/2 z-30 grid w-[min(96rem,calc(100vw-2rem))] -translate-x-1/2 gap-3 rounded-[22px] border border-white/10 bg-[#111214]/95 p-3 shadow-[0_22px_70px_rgba(0,0,0,0.48)] backdrop-blur-xl sm:bottom-[clamp(1rem,4.8vh,3.4rem)] sm:w-[min(96rem,calc(100vw-56rem))] sm:p-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (isSubmitting || hasUploadingFiles || isEnhancingPrompt) return
          if (submitConfirmedRef.current || dontAskCost) {
            submitConfirmedRef.current = false
            void handleSubmit({ preventDefault: () => {} } as FormEvent<HTMLFormElement>)
            return
          }
          setConfirmCostOpen(true)
        }}
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
            {([5, 10, 15, 30, 45, 135] as const).map((sec) => {
              const active = durationSeconds === sec
              // Local RTX models (Wan 2.1 / LTX) only support 5/10/15s clips.
              const disabled = selectedModel?.providerKey === 'local' && sec > 15
              return (
                <button
                  key={sec}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  title={disabled ? 'Local models support up to 15s clips' : undefined}
                  onClick={() => setDurationSeconds(sec)}
                  className={`rounded-full px-3 py-1.5 transition ${active ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'} ${disabled ? 'cursor-not-allowed opacity-30' : ''}`}
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 via-cyan-400 to-teal-400 text-white shadow-[0_4px_14px_rgba(34,211,238,0.45)] transition hover:from-sky-300 hover:via-cyan-300 hover:to-teal-300 hover:shadow-[0_6px_18px_rgba(34,211,238,0.6)]"
            aria-label="Reframe an image to a target aspect ratio"
            title="Reframe an image (9:16 / 1:1 / 16:9) with Nano Banana"
          >
            <Crop className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => { setAiDialogMode('frame'); setIsAiImageDialogOpen(true) }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-purple-500 to-pink-500 text-white shadow-[0_4px_14px_rgba(217,70,239,0.45)] transition hover:from-fuchsia-400 hover:via-purple-400 hover:to-pink-400 hover:shadow-[0_6px_18px_rgba(217,70,239,0.6)]"
            aria-label="Generate image with AI"
            title="Generate image with AI (Nano Banana)"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setIsScenarioDialogOpen(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 via-orange-400 to-pink-500 text-zinc-950 shadow-[0_4px_14px_rgba(251,146,60,0.45)] transition hover:from-amber-300 hover:via-orange-300 hover:to-pink-400 hover:shadow-[0_6px_18px_rgba(251,146,60,0.6)]"
            aria-label="Write a scenario from your idea"
            title="Write a scenario from your idea"
          >
            <Clapperboard className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>


        {!isTextToVideo ? (
          <div id="composer-start-frame" className="flex min-h-11 items-center gap-2 sm:min-h-12 sm:gap-3" aria-label="Prompt path">
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
            <span
              title={`Estimated cost for ${durationSeconds}s on ${selectedModel.label}${costEstimate.clips > 1 ? ` (${costEstimate.clips} × ${costEstimate.perClipSec}s clips)` : ''}`}
              className="hidden sm:inline-flex h-10 items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-3 text-[11px] font-semibold text-amber-200/90"
            >
              ≈ ${costEstimate.usd.toFixed(2)} · {costEstimate.credits} cr
            </span>
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

            <button
              type="button"
              onClick={() => setIsProductAdOpen(true)}
              aria-label="Create a product advertising scenario"
              title="Create a product advertising scenario"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-pink-500 px-4 text-sm font-bold text-zinc-950 shadow-[0_8px_24px_rgba(251,146,60,0.35)] transition hover:from-amber-300 hover:via-orange-300 hover:to-pink-400 hover:shadow-[0_10px_28px_rgba(251,146,60,0.5)]"
            >
              <Heart className="h-5 w-5 animate-heartbeat" aria-hidden="true" />
              Product Ad
            </button>


            <Popover
              open={isPromptMenuOpen}
              onOpenChange={(open) => {
                setIsPromptMenuOpen(open)
                if (!open) {
                  setNarratorMode('idle')
                  setNarratorScript('')
                  setStyleMode('idle')
                  setSelectedStyles(emptyStyleSelection())
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
                className={`${styleMode === 'input' ? 'w-[min(26rem,calc(100vw-2rem))]' : 'w-80'} border-white/10 bg-[#0b0c0e]/95 p-2 text-zinc-200 shadow-[0_22px_70px_rgba(0,0,0,0.5)] backdrop-blur-xl`}
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

                <button
                  type="button"
                  onClick={() => setStyleMode((m) => (m === 'input' ? 'idle' : 'input'))}
                  disabled={isEnhancingPrompt}
                  className={`mt-1 flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40 ${
                    styleMode === 'input' ? 'bg-white/[0.04]' : ''
                  }`}
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-amber-300/30 bg-amber-300/10 text-amber-200">
                    <Wand2 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                      Styles
                      {selectedStyleCount > 0 ? (
                        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-300 px-1 text-[10px] font-bold text-zinc-950">
                          {selectedStyleCount}
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs leading-5 text-zinc-500">
                      Pick camera, genre, scene or template styles — the prompt is optimized for them.
                    </span>
                  </span>
                  <ChevronDown
                    className={`mt-1 h-4 w-4 shrink-0 text-zinc-500 transition ${styleMode === 'input' ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>

                {styleMode === 'input' ? (
                  <div className="mt-2 space-y-3 border-t border-white/10 px-1 pt-3">
                    <div className="max-h-[44vh] space-y-3 overflow-y-auto pr-1">
                      <StyleSection
                        title="Camera style"
                        items={CAMERA_STYLES}
                        selectedIds={selectedStyles.camera}
                        onToggle={(id) => toggleStyle('camera', id)}
                      />
                      <StyleSection
                        title="Genre & atmosphere"
                        items={GENRE_STYLES}
                        selectedIds={selectedStyles.genre}
                        onToggle={(id) => toggleStyle('genre', id)}
                      />
                      {SCENE_GROUP_ORDER.map((group) => (
                        <StyleSection
                          key={group}
                          title={`Scene · ${group}`}
                          items={SCENE_STYLES.filter((s) => s.group === group)}
                          selectedIds={selectedStyles.scene}
                          onToggle={(id) => toggleStyle('scene', id)}
                        />
                      ))}
                      {TEMPLATE_GROUP_ORDER.map((group) => (
                        <StyleSection
                          key={group}
                          title={`Template · ${group}`}
                          items={TEMPLATE_STYLES.filter((t) => t.group === group)}
                          selectedIds={selectedStyles.template}
                          onToggle={(id) => toggleStyle('template', id)}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedStyles(emptyStyleSelection())}
                        disabled={isEnhancingPrompt || selectedStyleCount === 0}
                        className="text-[11px] text-zinc-500 transition hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => runEnhancePrompt({ mode: 'styles', styleHints: buildStyleHints(selectedStyles) })}
                        disabled={isEnhancingPrompt || selectedStyleCount === 0 || promptText.trim().length === 0}
                        className="inline-flex h-8 items-center gap-2 rounded-full bg-amber-300 px-3 text-xs font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isEnhancingPrompt ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        Optimize
                      </button>
                    </div>
                  </div>
                ) : null}
              </PopoverContent>
            </Popover>

            <button
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
              type="submit"
              disabled={isSubmitting || hasUploadingFiles || isEnhancingPrompt || isPlanningPrompt}
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
      )}


      {isReadOnlyProject && (
        <div className="fixed bottom-4 left-1/2 z-30 flex w-[min(96rem,calc(100vw-2rem))] -translate-x-1/2 items-center justify-center gap-2 rounded-[22px] border border-white/10 bg-[#111214]/95 p-4 text-center text-xs text-zinc-400 shadow-[0_22px_70px_rgba(0,0,0,0.48)] backdrop-blur-xl sm:bottom-[clamp(1rem,4.8vh,3.4rem)] sm:w-[min(96rem,calc(100vw-56rem))]">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>This final video is read-only. Use Start over to create a new project.</span>
        </div>
      )}

      <Dialog open={!!previewImageUrl} onOpenChange={(o) => { if (!o) setPreviewImageUrl(null) }}>
        <DialogContent className="w-fit max-w-[95vw] border-white/10 bg-black/90 p-3">
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
      <Dialog open={promptViewer !== null} onOpenChange={(o) => { if (!o) setPromptViewer(null) }}>
        <DialogContent className="max-w-2xl border-white/10 bg-[#0b0c0e]/95">
          <DialogHeader>
            <DialogTitle>Prompt</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">
            {promptViewer}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editPromptJob !== null}
        onOpenChange={(o) => {
          if (!o) {
            setEditPromptJob(null)
            setEditPromptText('')
          }
        }}
      >
        <DialogContent className="max-w-2xl border-white/10 bg-[#0b0c0e]/95">
          <DialogHeader>
            <DialogTitle>Edit prompt & regenerate</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Change the prompt and regenerate. The old card is permanently replaced by the new one.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={editPromptText}
            onChange={(e) => setEditPromptText(e.target.value)}
            rows={8}
            className="w-full resize-y rounded-lg border border-white/10 bg-black/40 p-3 text-sm leading-6 text-zinc-100 outline-none focus:border-sky-300/40"
            placeholder="Describe what you want to generate…"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEditPromptJob(null)
                setEditPromptText('')
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={
                !editPromptText.trim() ||
                (editPromptJob ? regeneratingIds.has(editPromptJob.id) : true)
              }
              onClick={() => {
                const target = editPromptJob
                if (!target) return
                const nextPrompt = editPromptText.trim()
                setEditPromptJob(null)
                setEditPromptText('')
                regenerateCard(target, { prompt: nextPrompt })
              }}
            >
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={copyrightJob !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCopyrightJob(null)
            setCopyrightResult(null)
            setCopyrightError(null)
            setCopyrightLoading(false)
          }
        }}
      >
        <DialogContent className="max-w-lg border-white/10 bg-[#0b0c0e]/95 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-violet-300" aria-hidden="true" />
              Copyright check
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              An AI review of the final video and its music/voiceover for copyright risk.
            </DialogDescription>
          </DialogHeader>

          {copyrightLoading ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <LoaderCircle className="h-7 w-7 animate-spin text-violet-300" aria-hidden="true" />
              <p className="text-sm text-zinc-300">Analyzing video and music…</p>
              <p className="text-xs text-zinc-500">This can take up to a minute.</p>
            </div>
          ) : copyrightError ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-rose-300">{copyrightError}</p>
              <Button
                variant="outline"
                className="border-white/10"
                onClick={() => { if (copyrightJob) void runCopyrightCheck(copyrightJob) }}
              >
                Try again
              </Button>
            </div>
          ) : copyrightResult ? (
            (() => {
              const tone = (status: string | undefined) =>
                status === 'approved'
                  ? { text: 'text-emerald-300', bg: 'bg-emerald-300/10 border-emerald-300/30', Icon: ShieldCheck, label: 'Approved' }
                  : status === 'rejected'
                    ? { text: 'text-rose-300', bg: 'bg-rose-300/10 border-rose-300/30', Icon: ShieldX, label: 'Rejected' }
                    : status === 'not_provided'
                      ? { text: 'text-zinc-400', bg: 'bg-white/5 border-white/10', Icon: Shield, label: 'Not provided' }
                      : { text: 'text-amber-300', bg: 'bg-amber-300/10 border-amber-300/30', Icon: ShieldAlert, label: 'Caution' }
              const Section = ({ title, section }: { title: string; section?: CopyrightSection }) => {
                const t = tone(section?.status)
                return (
                  <div className={`rounded-xl border p-3 ${t.bg}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{title}</span>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${t.text}`}>
                        <t.Icon className="h-3.5 w-3.5" aria-hidden="true" /> {t.label}
                      </span>
                    </div>
                    {section?.reason ? (
                      <p className="mt-2 text-xs leading-5 text-zinc-300">{section.reason}</p>
                    ) : null}
                    {section?.risks && section.risks.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-zinc-400">
                        {section.risks.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    ) : null}
                  </div>
                )
              }
              const overall = tone(copyrightResult.verdict)
              return (
                <div className="space-y-3">
                  <div className={`flex items-center gap-3 rounded-xl border p-3 ${overall.bg}`}>
                    <overall.Icon className={`h-6 w-6 ${overall.text}`} aria-hidden="true" />
                    <div>
                      <p className={`text-sm font-semibold ${overall.text}`}>{overall.label}</p>
                      {copyrightResult.summary ? (
                        <p className="text-xs leading-5 text-zinc-300">{copyrightResult.summary}</p>
                      ) : null}
                    </div>
                  </div>
                  <Section title="Video" section={copyrightResult.video} />
                  <Section title="Music & voiceover" section={copyrightResult.music} />
                  <p className="text-[11px] leading-5 text-zinc-500">
                    This is an AI-based estimate, not legal advice or definitive song matching.
                  </p>
                </div>
              )
            })()
          ) : null}
        </DialogContent>
      </Dialog>




      <Dialog open={confirmCostOpen} onOpenChange={setConfirmCostOpen}>
        <DialogContent className="max-w-md border-white/10 bg-[#0b0c0e]/95 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Confirm generation cost</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Review the estimated cost before generating. Credits are deducted only if generation succeeds.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 rounded-lg border border-white/10 bg-black/30 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Model</span>
              <span className="font-semibold">{selectedModel.label}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Duration</span>
              <span className="font-semibold">
                {costEstimate.clips > 1
                  ? `${costEstimate.clips} × ${costEstimate.perClipSec}s = ${durationSeconds}s`
                  : `${durationSeconds}s`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Per clip</span>
              <span className="font-semibold">
                ${costEstimate.perClipUsd.toFixed(2)} ({Math.round(costEstimate.perClipUsd * 100)} cr)
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-2.5">
              <span className="text-zinc-300">Estimated total</span>
              <span className="text-base font-bold text-amber-300">
                ≈ ${costEstimate.usd.toFixed(2)} · {costEstimate.credits} credits
              </span>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-amber-300"
              checked={dontAskCost}
              onChange={(e) => {
                const v = e.target.checked
                setDontAskCost(v)
                if (typeof window !== 'undefined') {
                  if (v) window.sessionStorage.setItem('ui:skip-cost-confirm', '1')
                  else window.sessionStorage.removeItem('ui:skip-cost-confirm')
                }
              }}
            />
            Don&apos;t ask again this session
          </label>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setConfirmCostOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 px-4 text-xs font-semibold text-zinc-200 hover:bg-white/[0.05]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmCostOpen(false)
                submitConfirmedRef.current = true
                if (composerRef.current) composerRef.current.requestSubmit()
              }}
              className="inline-flex h-9 items-center justify-center rounded-full bg-amber-300 px-4 text-xs font-bold text-zinc-950 hover:bg-amber-200"
            >
              Generate (${costEstimate.usd.toFixed(2)})
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
