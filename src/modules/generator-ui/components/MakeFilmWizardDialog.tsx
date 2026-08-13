import { useEffect, useRef, useState } from 'react'
import {
  Clapperboard,
  LoaderCircle,
  RefreshCw,
  Wand2,
  Film,
  ArrowRight,
  ArrowLeft,
  Check,
  ImageIcon,
  Clock,
  Package,
  UserRound,
  Mic,
  MicOff,
  ZoomIn,
  X,
  MonitorPlay,
  ChevronDown,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { safeMediaUrl } from '@/modules/generator-ui/lib/safeMediaUrl'
import { canApproveFilm, isCharacterSheet, loadCharacterRows, sanitizeProductName, type FilmDuration, type FilmAspect } from '@/modules/generator-ui/lib/makeFilmWizard'
import { buildWizardCameraOptions, buildWizardThemeOptions, type WizardStyleOption } from '@/modules/generator-ui/lib/promptStyles'
import { StylePickerDialog, type StylePickerOption, type StylePickerTab } from '@/modules/generator-ui/components/StylePickerDialog'
import { supabase } from '@/integrations/supabase/client'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export type { FilmDuration, FilmAspect } from '@/modules/generator-ui/lib/makeFilmWizard'
// Must stay a subset of DashboardPage's `Ratio` ('9:16' | '1:1' | '16:9') —
// that is what ai-image-generate and submitScenesAsJobs accept. 4:3 is
// deliberately absent: offering it here produced an aspect the render
// pipeline cannot honour.

const DURATIONS: FilmDuration[] = [5, 10, 15, 30, 45, 60, 90, 135]
const ASPECTS: { value: FilmAspect; label: string; dims: string }[] = [
  { value: '16:9', label: 'Landscape (16:9)', dims: '1920×1080' },
  { value: '9:16', label: 'Portrait/Story (9:16)', dims: '1080×1920' },
  { value: '1:1', label: 'Square (1:1)', dims: '1080×1080' },
]

// Camera angle and Visual theme options are derived from the shared
// promptStyles dataset (CAMERA_STYLES, GENRE_STYLES, SCENE_STYLES,
// TEMPLATE_STYLES) so the wizard shows the SAME full set of styles as the
// composer's Styles picker — all 10 camera styles, all genres, all scenes
// (including Industrial and Construction & Civil Works) and all video
// templates, with the same grouping and previews.
const CAMERA_ANGLES: WizardStyleOption[] = buildWizardCameraOptions()
const THEMES: WizardStyleOption[] = buildWizardThemeOptions()

// The Visual theme picker splits the shared dataset into three tabs:
// Genre & atmosphere, Scene & environment, and Video templates. The "auto"
// (None) option is always shown separately above the tabs.
const THEME_TABS: StylePickerTab[] = [
  {
    id: 'genre',
    label: 'Genre',
    options: THEMES.filter((t) => t.group === 'Genre & atmosphere').map(toPickerOption),
  },
  {
    id: 'scene',
    label: 'Scene',
    options: THEMES.filter((t) => t.group?.startsWith('Scene ·')).map(toPickerOption),
  },
  {
    id: 'template',
    label: 'Video Templates',
    options: THEMES.filter((t) => t.group?.startsWith('Template ·')).map(toPickerOption),
  },
]

// Convert a shared WizardStyleOption into the picker's option shape. The raw
// preview URL (an MP4 clip for most styles) is passed through so the picker
// can render it as a <video> instead of forcing it into an <img>.
function toPickerOption(opt: WizardStyleOption): StylePickerOption {
  return {
    value: opt.value,
    label: opt.label,
    preview: opt.imageUrl && opt.imageUrl !== '/placeholder.svg' ? opt.imageUrl : undefined,
    group: opt.group,
  }
}

const CAMERA_PICKER_OPTIONS: StylePickerOption[] = CAMERA_ANGLES.map(toPickerOption)

const PRODUCTS_BUCKET = 'user-images'
const FRAMES_BUCKET = 'wan-frames'
