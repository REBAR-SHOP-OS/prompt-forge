import { useEffect, useRef, useState } from 'react'
import { Package, LoaderCircle, RefreshCw, Copy, Check, Wand2, Send, ImagePlus, X, Languages, Boxes, ArrowLeft, Sparkles, Drama, UserRound, Building2, History } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { supabase } from '@/integrations/supabase/client'
import { StylePreviewCard } from './StylePreviewCard'
import AiImageDialog, { type AiImageSavedRow } from './AiImageDialog'
import camWhipPan from '@/assets/style-previews/cam-whip-pan.mp4.asset.json'
import camOrbit from '@/assets/style-previews/cam-orbit.mp4.asset.json'
import camFpvDrone from '@/assets/style-previews/cam-fpv-drone.mp4.asset.json'
import camTracking from '@/assets/style-previews/cam-tracking.mp4.asset.json'
import camPushIn from '@/assets/style-previews/cam-push-in.mp4.asset.json'
import camFlyThrough from '@/assets/style-previews/cam-fly-through.mp4.asset.json'
import camCrashZoom from '@/assets/style-previews/cam-crash-zoom.mp4.asset.json'
import camHandheld from '@/assets/style-previews/cam-handheld.mp4.asset.json'
import camDollyZoom from '@/assets/style-previews/cam-dolly-zoom.mp4.asset.json'
import camParallax from '@/assets/style-previews/cam-parallax.mp4.asset.json'
import genreEpicFantasy from '@/assets/style-previews/genre-epic-fantasy.mp4.asset.json'
import genreScifiMinimal from '@/assets/style-previews/genre-scifi-minimal.mp4.asset.json'
import genrePostApocalyptic from '@/assets/style-previews/genre-post-apocalyptic.mp4.asset.json'
import genreHorror from '@/assets/style-previews/genre-horror.mp4.asset.json'
import genreAction from '@/assets/style-previews/genre-action.mp4.asset.json'
import genreRomantic from '@/assets/style-previews/genre-romantic.mp4.asset.json'
import genreDocumentary from '@/assets/style-previews/genre-documentary.mp4.asset.json'
import genreAnime from '@/assets/style-previews/genre-anime.mp4.asset.json'
import scConstructionSite from '@/assets/style-previews/scene-construction-site.mp4.asset.json'
import scHeavyIndustry from '@/assets/style-previews/scene-heavy-industry.mp4.asset.json'
import scAbandonedWarehouse from '@/assets/style-previews/scene-abandoned-warehouse.mp4.asset.json'
import scShipyardDock from '@/assets/style-previews/scene-shipyard-dock.mp4.asset.json'
import scHighTechLab from '@/assets/style-previews/scene-high-tech-lab.mp4.asset.json'
import scMegacityCorporate from '@/assets/style-previews/scene-megacity-corporate.mp4.asset.json'
import scCyberpunkAlleyway from '@/assets/style-previews/scene-cyberpunk-alleyway.mp4.asset.json'
import scSubwayStation from '@/assets/style-previews/scene-subway-station.mp4.asset.json'
import scRooftopOverlook from '@/assets/style-previews/scene-rooftop-overlook.mp4.asset.json'
import scEpicMountain from '@/assets/style-previews/scene-epic-mountain.mp4.asset.json'
import scApocalypticWasteland from '@/assets/style-previews/scene-apocalyptic-wasteland.mp4.asset.json'
import scMysticalForest from '@/assets/style-previews/scene-mystical-forest.mp4.asset.json'
import scArcticTundra from '@/assets/style-previews/scene-arctic-tundra.mp4.asset.json'
import scMedievalCastle from '@/assets/style-previews/scene-medieval-castle.mp4.asset.json'
import scAncientRuins from '@/assets/style-previews/scene-ancient-ruins.mp4.asset.json'
import scGothicCathedral from '@/assets/style-previews/scene-gothic-cathedral.mp4.asset.json'
import scSteampunkWorkshop from '@/assets/style-previews/scene-steampunk-workshop.mp4.asset.json'
import scJazzClub from '@/assets/style-previews/scene-jazz-club.mp4.asset.json'
import scDarkAcademiaLibrary from '@/assets/style-previews/scene-dark-academia-library.mp4.asset.json'
import scRetroDiner from '@/assets/style-previews/scene-retro-diner.mp4.asset.json'
import scHighRiseTower from '@/assets/style-previews/scene-high-rise-tower.mp4.asset.json'
import scSteelFramework from '@/assets/style-previews/scene-steel-framework.mp4.asset.json'
import scConcretePour from '@/assets/style-previews/scene-concrete-pour.mp4.asset.json'
import scRebarSite from '@/assets/style-previews/scene-rebar-site.mp4.asset.json'
import scTowerCrane from '@/assets/style-previews/scene-tower-crane.mp4.asset.json'
import scBridgeConstruction from '@/assets/style-previews/scene-bridge-construction.mp4.asset.json'
import scRoadPaving from '@/assets/style-previews/scene-road-paving.mp4.asset.json'
import scTunnelBoring from '@/assets/style-previews/scene-tunnel-boring.mp4.asset.json'
import scFoundationEarthworks from '@/assets/style-previews/scene-foundation-earthworks.mp4.asset.json'
import scScaffoldingFacade from '@/assets/style-previews/scene-scaffolding-facade.mp4.asset.json'
import scResidentialBuild from '@/assets/style-previews/scene-residential-build.mp4.asset.json'
import scPrefabModular from '@/assets/style-previews/scene-prefab-modular.mp4.asset.json'
import scDemolitionSite from '@/assets/style-previews/scene-demolition-site.mp4.asset.json'
import scDamHydro from '@/assets/style-previews/scene-dam-hydro.mp4.asset.json'
import scRefineryBuild from '@/assets/style-previews/scene-refinery-build.mp4.asset.json'
import scRenewableFarm from '@/assets/style-previews/scene-renewable-farm.mp4.asset.json'
import scSiteSurvey from '@/assets/style-previews/scene-site-survey.mp4.asset.json'
import scDeepPiling from '@/assets/style-previews/scene-deep-piling.mp4.asset.json'
import scFormworkShuttering from '@/assets/style-previews/scene-formwork-shuttering.mp4.asset.json'
import scPrecastYard from '@/assets/style-previews/scene-precast-yard.mp4.asset.json'
import scMasonryBrick from '@/assets/style-previews/scene-masonry-brick.mp4.asset.json'
import scStructuralWelding from '@/assets/style-previews/scene-structural-welding.mp4.asset.json'
import scCurtainWall from '@/assets/style-previews/scene-curtain-wall.mp4.asset.json'
import scRoofingWaterproofing from '@/assets/style-previews/scene-roofing-waterproofing.mp4.asset.json'
import scMepInstall from '@/assets/style-previews/scene-mep-install.mp4.asset.json'
import scElectricalWiring from '@/assets/style-previews/scene-electrical-wiring.mp4.asset.json'
import scInteriorFitout from '@/assets/style-previews/scene-interior-fitout.mp4.asset.json'
import scPlasteringFinishing from '@/assets/style-previews/scene-plastering-finishing.mp4.asset.json'
import scElevatorShaft from '@/assets/style-previews/scene-elevator-shaft.mp4.asset.json'
import scMetroRailway from '@/assets/style-previews/scene-metro-railway.mp4.asset.json'
import scAirportRunway from '@/assets/style-previews/scene-airport-runway.mp4.asset.json'
import scPortMarine from '@/assets/style-previews/scene-port-marine.mp4.asset.json'
import scCanalWater from '@/assets/style-previews/scene-canal-water.mp4.asset.json'
import scPipelineLaying from '@/assets/style-previews/scene-pipeline-laying.mp4.asset.json'
import scPowerPlant from '@/assets/style-previews/scene-power-plant.mp4.asset.json'
import scWarehouseLogistics from '@/assets/style-previews/scene-warehouse-logistics.mp4.asset.json'
import scStadiumArena from '@/assets/style-previews/scene-stadium-arena.mp4.asset.json'
import scNightConstruction from '@/assets/style-previews/scene-night-construction.mp4.asset.json'
import vtFootballTeam from '@/assets/style-previews/vid-football-team.mp4.asset.json'
import vtSportsHighlights from '@/assets/style-previews/vid-sports-highlights.mp4.asset.json'
import vtFitness from '@/assets/style-previews/vid-fitness.mp4.asset.json'
import vtGamingEsports from '@/assets/style-previews/vid-gaming-esports.mp4.asset.json'
import vtExplainer from '@/assets/style-previews/vid-explainer.mp4.asset.json'
import vtLogoReveal from '@/assets/style-previews/vid-logo-reveal.mp4.asset.json'
import vtKineticTypography from '@/assets/style-previews/vid-kinetic-typography.mp4.asset.json'
import vtMotionComic from '@/assets/style-previews/vid-motion-comic.mp4.asset.json'
import vtYoutubeIntroOutro from '@/assets/style-previews/vid-youtube-intro-outro.mp4.asset.json'
import vtInstagramReels from '@/assets/style-previews/vid-instagram-reels.mp4.asset.json'
import vtTiktokTrends from '@/assets/style-previews/vid-tiktok-trends.mp4.asset.json'
import vtVodcast from '@/assets/style-previews/vid-vodcast.mp4.asset.json'
import vtCompanyProfile from '@/assets/style-previews/vid-company-profile.mp4.asset.json'
import vtInfographic from '@/assets/style-previews/vid-infographic.mp4.asset.json'
import vtRealEstate from '@/assets/style-previews/vid-real-estate.mp4.asset.json'
import vtProductPromo from '@/assets/style-previews/vid-product-promo.mp4.asset.json'
import vtMovieTrailer from '@/assets/style-previews/vid-movie-trailer.mp4.asset.json'
import vtPhotoSlideshow from '@/assets/style-previews/vid-photo-slideshow.mp4.asset.json'
import vtGlitchRetro from '@/assets/style-previews/vid-glitch-retro.mp4.asset.json'
import vtVfx from '@/assets/style-previews/vid-vfx.mp4.asset.json'
import vtWedding from '@/assets/style-previews/vid-wedding.mp4.asset.json'
import vtBirthdayParty from '@/assets/style-previews/vid-birthday-party.mp4.asset.json'
import vtCalendarCampaigns from '@/assets/style-previews/vid-calendar-campaigns.mp4.asset.json'
import vtWhiteboard from '@/assets/style-previews/vid-whiteboard.mp4.asset.json'
import vtBlackboard from '@/assets/style-previews/vid-blackboard.mp4.asset.json'
import vtGlassboard from '@/assets/style-previews/vid-glassboard.mp4.asset.json'
import vtLineArt from '@/assets/style-previews/vid-line-art.mp4.asset.json'
import vtInfographicMotion from '@/assets/style-previews/vid-infographic-motion.mp4.asset.json'
import vtFlat2d from '@/assets/style-previews/vid-flat-2d.mp4.asset.json'
import vtIsometric from '@/assets/style-previews/vid-isometric.mp4.asset.json'
import vtCharacter2d from '@/assets/style-previews/vid-character-2d.mp4.asset.json'
import vtCutOut from '@/assets/style-previews/vid-cut-out.mp4.asset.json'
import vtStopMotion from '@/assets/style-previews/vid-stop-motion.mp4.asset.json'
import vtScreencastUi from '@/assets/style-previews/vid-screencast-ui.mp4.asset.json'
import vtLiveActionTracked from '@/assets/style-previews/vid-live-action-tracked.mp4.asset.json'

export type ProductAdDuration = 5 | 10 | 15 | 30 | 45 | 135

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDuration: ProductAdDuration
  userId: string | null
  variant?: 'product' | 'character'
  onUseAsPrompt: (
    scenario: string,
    imageUrl?: string,
    duration?: ProductAdDuration,
    identity?: ProductAdIdentity,
  ) => void
  onSendScenes?: (
    scenes: string[],
    imageUrl?: string,
    duration?: ProductAdDuration,
    identity?: ProductAdIdentity,
  ) => void | Promise<void>
}

export type ProductAdIdentity = {
  productRefUrl?: string
  characterRefUrl?: string
  productName?: string
}

const DURATIONS: ProductAdDuration[] = [5, 10, 15, 30, 45, 135]
const FRAMES_BUCKET = 'wan-frames'
const PRODUCTS_BUCKET = 'user-images'
const PROJECT_ID = 'sacxoanuyetjfrfllkzx'
const FUNCTIONS_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`

type ProductAspect = '9:16' | '1:1' | '16:9'
const PRODUCT_ASPECTS: { value: ProductAspect; cls: string }[] = [
  { value: '9:16', cls: 'aspect-[9/16]' },
  { value: '1:1', cls: 'aspect-square' },
  { value: '16:9', cls: 'aspect-video' },
]

/** Canonical pixel dimensions for each aspect ratio (used to record/derive ratio). */
const ASPECT_DIMS: Record<ProductAspect, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1024, h: 1024 },
  '16:9': { w: 1920, h: 1080 },
}

/** Snap an arbitrary width:height to the nearest supported aspect-ratio label. */
function aspectLabelFromDims(width: number | null | undefined, height: number | null | undefined): ProductAspect {
  if (!width || !height || width <= 0 || height <= 0) return '1:1'
  const r = width / height
  let best: ProductAspect = '1:1'
  let bestDiff = Infinity
  for (const a of PRODUCT_ASPECTS) {
    const dims = ASPECT_DIMS[a.value]
    const diff = Math.abs(r - dims.w / dims.h)
    if (diff < bestDiff) {
      bestDiff = diff
      best = a.value
    }
  }
  return best
}

type ReframeItem = { id: string; title: string | null; url: string; aspect: ProductAspect }



type ProductPhoto = { id: string; title: string | null; url: string }

/** Extract the object key inside the user-images bucket from a stored path/URL. */
function productObjectKey(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null
  const marker = `/${PRODUCTS_BUCKET}/`
  const idx = storagePath.indexOf(marker)
  if (idx >= 0) return decodeURIComponent(storagePath.slice(idx + marker.length))
  if (!/^https?:|^blob:|^data:/.test(storagePath)) return storagePath
  return null
}

/** Strip trailing catalog numbers and turn a slug into a readable name. */
function cleanProductName(title: string | null | undefined): string {
  if (!title) return ''
  return title
    .replace(/[\s_-]*\d+\s*$/u, '') // drop trailing number suffix (e.g. _005, -005, " 005")
    .replace(/[_-]+/gu, ' ') // separators -> spaces
    .replace(/\s+/gu, ' ')
    .trim()
}

/** True when the (already cleaned) name still looks like a technical code, not a real product name. */
function looksLikeCode(name: string | null | undefined): boolean {
  const t = (name ?? '').trim()
  if (!t) return true // empty after cleaning -> needs a proper name
  if (/[_\-\d]/u.test(t)) return true // leftover separators or digits
  // Single token with no vowel reads like a code/garble (e.g. "skuxq")
  if (!/\s/.test(t) && !/[aeiouAEIOU]/.test(t)) return true
  return false
}



/** Resolve a displayable signed URL for a private-bucket product photo. */
async function signProductPhotoUrl(storagePath: string | null | undefined): Promise<string> {
  const raw = storagePath ?? ''
  if (/^blob:|^data:/.test(raw)) return raw
  if (/\/object\/sign\//.test(raw)) return raw
  const key = productObjectKey(raw)
  if (!key) return raw
  try {
    const { data, error } = await supabase.storage
      .from(PRODUCTS_BUCKET)
      .createSignedUrl(key, 60 * 60 * 24 * 365)
    if (!error && data?.signedUrl) return data.signedUrl
  } catch {
    /* fall through */
  }
  return raw
}

/** Extract the object key inside the wan-frames bucket from a stored path/URL. */
function framesObjectKey(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null
  const marker = `/${FRAMES_BUCKET}/`
  const idx = storagePath.indexOf(marker)
  if (idx >= 0) {
    // Strip any query string (e.g. an expired/broken public URL) before decoding.
    const tail = storagePath.slice(idx + marker.length).split('?')[0]
    return decodeURIComponent(tail)
  }
  if (!/^https?:|^blob:|^data:/.test(storagePath)) return storagePath
  return null
}

/**
 * Resolve a displayable signed URL for a private wan-frames object.
 * `wan-frames` is a PRIVATE bucket, so public URLs return "Bucket not found".
 * Throws if signing fails so the caller can show a clear error state.
 */
async function signFramesUrl(storagePath: string | null | undefined): Promise<string> {
  const raw = storagePath ?? ''
  if (/^blob:|^data:/.test(raw)) return raw
  const key = framesObjectKey(raw)
  if (!key) throw new Error('Could not resolve image path')
  const { data, error } = await supabase.storage
    .from(FRAMES_BUCKET)
    .createSignedUrl(key, 60 * 60 * 24 * 7)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Could not load image')
  }
  return data.signedUrl
}

const SPLIT_DURATIONS = [30, 45, 135]
const sceneRange = (i: number) => `${i * 15}–${(i + 1) * 15}s`

type Lang = 'en'

type Loc = Partial<Record<Lang, string>> & { en: string }
const tr = (m: Loc, lang: Lang) => m[lang] ?? m.en

const RTL_LANGS: Lang[] = []

const SELECT_LABEL: Loc = { en: 'Select', }
const SELECTED_LABEL: Loc = { en: 'Selected ✓', }

// All localized narration labels the edge function may emit, used to split a
// scene block into its visual scenario part and its narration part.
const NARRATION_LABELS = ['Narration', 'نریشن', 'التعليق الصوتي', 'Anlatım', 'Narración']
const NARRATION_RE = new RegExp(`(^|\\n)\\s*(${NARRATION_LABELS.join('|')})\\s*:\\s*`, 'i')

function splitNarration(text: string): { body: string; narration: string | null } {
  const m = text.match(NARRATION_RE)
  if (!m || m.index === undefined) return { body: text.trim(), narration: null }
  const labelStart = m.index + m[1].length
  const body = text.slice(0, labelStart).trim()
  const narration = text.slice(m.index + m[0].length).trim()
  return { body, narration: narration || null }
}

function SceneText({ text, narrationLabel }: { text: string; narrationLabel: string }) {
  const { body, narration } = splitNarration(text)
  return (
    <div className="space-y-2">
      <p dir="auto" className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">
        {body}
      </p>
      {narration ? (
        <div className="rounded-md border border-amber-400/30 bg-amber-400/5 px-2.5 py-2">
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300/90">
            {narrationLabel}
          </div>
          <p dir="auto" className="whitespace-pre-wrap text-sm leading-6 text-amber-50/90">
            {narration}
          </p>
        </div>
      ) : null}
    </div>
  )
}

const LANG_OPTIONS: { value: Lang; native: string }[] = [
  { value: 'en', native: 'English' },
]

const CAMERA_STYLES: { label: Loc; icon: string; desc?: Loc; preview?: string }[] = [
  { label: { en: 'Whip Pan', }, icon: '💫', preview: camWhipPan.url },
  { label: { en: 'Orbit Shot', }, icon: '🛰️', preview: camOrbit.url },
  { label: { en: 'FPV Drone', }, icon: '🚁', preview: camFpvDrone.url },
  { label: { en: 'Tracking Shot', }, icon: '🎯', preview: camTracking.url },
  { label: { en: 'Push In Cinematic', }, icon: '🎬', preview: camPushIn.url },
  { label: { en: 'Fly Through', }, icon: '🕊️', preview: camFlyThrough.url },
  { label: { en: 'Crash Zoom', }, icon: '💥', preview: camCrashZoom.url },
  { label: { en: 'Handheld Dynamic' }, icon: '🤳', preview: camHandheld.url },
  { label: { en: 'Dolly Zoom', }, icon: '🌀', preview: camDollyZoom.url },
  { label: { en: 'Parallax Motion', }, icon: '🧊', preview: camParallax.url },
]

type GenreTemplate = { id: string; label: Loc; icon: string; prompt: string; preview?: string }

const GENRE_TEMPLATES: GenreTemplate[] = [
  {
    id: 'epic-fantasy',
    label: { en: 'Epic Fantasy', },
    icon: '🐉',
    prompt:
      'Epic fantasy directing: sweeping wide vistas of dreamlike landscapes, castles and mythical creatures, magical glowing lighting and an awe-inspiring heroic mood.',
    preview: genreEpicFantasy.url,
  },
  {
    id: 'sci-fi-minimalist',
    label: { en: 'Sci-Fi Minimalist', },
    icon: '🛸',
    prompt:
      'Minimalist sci-fi directing: clean white spaces, straight lines, hidden seamless technology and a calm, sleek futuristic atmosphere.',
    preview: genreScifiMinimal.url,
  },
  {
    id: 'post-apocalyptic',
    label: { en: 'Post-Apocalyptic', },
    icon: '☢️',
    prompt:
      'Post-apocalyptic directing: ruined cities, nature overgrowing buildings, ash, dust and a desolate abandoned atmosphere with muted desaturated tones.',
    preview: genrePostApocalyptic.url,
  },
  {
    id: 'horror-jump-scare',
    label: { en: 'Horror Jump-Scare', },
    icon: '👻',
    prompt:
      'Sudden-horror directing: deep darkness, harsh localized light (like a flashlight), tense silence and abrupt movement changes that create dread and fear.',
    preview: genreHorror.url,
  },
  {
    id: 'high-octane-action',
    label: { en: 'High-Octane Action', },
    icon: '🔥',
    prompt:
      'High-octane action directing: rapid cuts, camera shake, explosions, high speed and motion blur for an intense adrenaline-fueled feel.',
    preview: genreAction.url,
  },
  {
    id: 'romantic-dreamscape',
    label: { en: 'Romantic Dreamscape', },
    icon: '💗',
    prompt:
      'Romantic dreamscape directing: soft golden-hour sunlight, gentle soft focus on the subjects and warm dreamy colors for an intimate emotional mood.',
    preview: genreRomantic.url,
  },
  {
    id: 'documentary-realism',
    label: { en: 'Documentary / Realism', },
    icon: '🎥',
    prompt:
      'Documentary realism directing: natural light, no stylized grading, true-to-life colors and simple unobtrusive camera movements for an authentic real feel.',
    preview: genreDocumentary.url,
  },
  {
    id: 'anime-manga',
    label: { en: 'Anime / Manga Style', },
    icon: '🌸',
    prompt:
      'Anime/manga style directing: bold outline lines, saturated flat 2D colors and exaggerated dynamic motion effects with expressive energetic action.',
    preview: genreAnime.url,
  },
]

type SceneTemplate = { id: string; label: Loc; icon: string; group: Loc; prompt: string; preview?: string }

const G_INDUSTRIAL: Loc = { en: 'Industrial & Construction', }
const G_CONSTRUCTION: Loc = { en: 'Construction & Civil Works', }
const G_URBAN: Loc = { en: 'Urban & Modern', }
const G_NATURE: Loc = { en: 'Natural & Epic Landscapes', }
const G_HISTORICAL: Loc = { en: 'Historical & Fantasy', }
const G_INTERIOR: Loc = { en: 'Interior & Moody', }

const SCENE_TEMPLATES: SceneTemplate[] = [
  // Industrial & Construction
  { id: 'construction-site', label: { en: 'Construction Site', }, icon: '🏗️', group: G_INDUSTRIAL, prompt: 'Construction site environment: steel building skeletons, giant moving cranes, dust and dirt, hard-hat workers at sunset.', preview: scConstructionSite.url },
  { id: 'heavy-industry', label: { en: 'Heavy Industry Factory' }, icon: '🏭', group: G_INDUSTRIAL, prompt: 'Heavy industry factory environment: molten iron, welding sparks, large gear machinery and huge smokestacks.', preview: scHeavyIndustry.url },
  { id: 'abandoned-warehouse', label: { en: 'Abandoned Warehouse', }, icon: '🕸️', group: G_INDUSTRIAL, prompt: 'Abandoned warehouse environment: large empty space, broken windows, light beams piercing from the roof and dust floating in the air.', preview: scAbandonedWarehouse.url },
  { id: 'shipyard-dock', label: { en: 'Shipyard / Dock', }, icon: '🚢', group: G_INDUSTRIAL, prompt: 'Shipyard and dock environment: giant container ships, coastal cranes, seawater and rusty steel structures.', preview: scShipyardDock.url },
  { id: 'high-tech-lab', label: { en: 'High-Tech Laboratory', }, icon: '🔬', group: G_INDUSTRIAL, prompt: 'High-tech laboratory environment: clean white walls, blinking computer server racks, glass chambers and cold blue or laser lighting.', preview: scHighTechLab.url },
  // Construction & Civil Works
  { id: 'high-rise-tower', label: { en: 'High-Rise Tower Construction', }, icon: '🏗️', group: G_CONSTRUCTION, prompt: 'High-rise tower construction environment: a partially built concrete tower rising floor by floor, tower cranes swinging loads, workers on open decks and safety nets against a city skyline.', preview: scHighRiseTower.url },
  { id: 'steel-framework', label: { en: 'Skyscraper Steel Framework', }, icon: '🏙️', group: G_CONSTRUCTION, prompt: 'Skyscraper steel framework environment: exposed structural steel beams and columns being bolted and welded high above the city, ironworkers walking girders with sparks raining down.', preview: scSteelFramework.url },
  { id: 'concrete-pour', label: { en: 'Concrete Pour / Casting', }, icon: '🧱', group: G_CONSTRUCTION, prompt: 'Concrete pour and casting environment: a boom pump delivering wet concrete into formwork, workers vibrating and screeding the surface, gray slurry and formwork panels everywhere.', preview: scConcretePour.url },
  { id: 'rebar-site', label: { en: 'Rebar & Reinforcement Site', }, icon: '🔩', group: G_CONSTRUCTION, prompt: 'Rebar and reinforcement environment: dense grids of steel reinforcing bars tied together across a slab or column cage, workers bending and fastening bars, orange rust texture and geometric patterns.', preview: scRebarSite.url },
  { id: 'tower-crane', label: { en: 'Tower Crane Operation', }, icon: '🏗️', group: G_CONSTRUCTION, prompt: 'Tower crane operation environment: a towering crane lifting heavy loads across a construction site, long jib against the sky, cables tensioning and materials rising slowly with cinematic scale.', preview: scTowerCrane.url },
  { id: 'bridge-construction', label: { en: 'Highway / Bridge Construction', }, icon: '🌉', group: G_CONSTRUCTION, prompt: 'Highway and bridge construction environment: massive concrete piers, cantilevered spans reaching across a valley, launching gantries and segmental deck sections with epic infrastructure scale.', preview: scBridgeConstruction.url },
  { id: 'road-paving', label: { en: 'Road Paving & Asphalt', }, icon: '🛣️', group: G_CONSTRUCTION, prompt: 'Road paving environment: an asphalt paver laying fresh hot mix, steam rising, rollers compacting the surface and crews in high-vis vests under harsh daylight.', preview: scRoadPaving.url },
  { id: 'tunnel-boring', label: { en: 'Tunnel Boring / Excavation', }, icon: '🚧', group: G_CONSTRUCTION, prompt: 'Tunnel boring and excavation environment: a giant tunnel boring machine cutting through rock, dim underground lighting, dust, conveyor belts of spoil and curved concrete tunnel segments.', preview: scTunnelBoring.url },
  { id: 'foundation-earthworks', label: { en: 'Foundation & Earthworks', }, icon: '⛏️', group: G_CONSTRUCTION, prompt: 'Foundation and earthworks environment: excavators digging deep pits, piling rigs driving foundations, mounds of soil, muddy access roads and heavy machinery churning the ground.', preview: scFoundationEarthworks.url },
  { id: 'scaffolding-facade', label: { en: 'Scaffolding & Facade Work', }, icon: '🧗', group: G_CONSTRUCTION, prompt: 'Scaffolding and facade work environment: multi-level metal scaffolding wrapping a building, mesh netting, workers installing cladding and glass panels high on the elevation.', preview: scScaffoldingFacade.url },
  { id: 'residential-build', label: { en: 'Residential Housing Build', }, icon: '🏘️', group: G_CONSTRUCTION, prompt: 'Residential housing construction environment: rows of half-built homes with timber framing, brickwork and roof trusses, stacks of materials and a developing suburban site.', preview: scResidentialBuild.url },
  { id: 'prefab-modular', label: { en: 'Prefab / Modular Assembly', }, icon: '📦', group: G_CONSTRUCTION, prompt: 'Prefabricated modular construction environment: cranes lowering factory-built room modules into place like giant building blocks, clean precise assembly and rapid stacking of units.', preview: scPrefabModular.url },
  { id: 'demolition-site', label: { en: 'Demolition Site', }, icon: '💥', group: G_CONSTRUCTION, prompt: 'Demolition environment: an excavator with a hydraulic breaker tearing down a structure, collapsing walls, billowing dust clouds and piles of rubble and twisted rebar.', preview: scDemolitionSite.url },
  { id: 'dam-hydro', label: { en: 'Dam / Hydro Construction', }, icon: '🌊', group: G_CONSTRUCTION, prompt: 'Dam and hydro construction environment: a massive concrete dam wall under construction, spillways, diversion channels, huge machinery and turbulent water against monumental scale.', preview: scDamHydro.url },
  { id: 'refinery-build', label: { en: 'Oil & Gas / Refinery Build', }, icon: '🛢️', group: G_CONSTRUCTION, prompt: 'Oil and gas plant construction environment: a maze of steel piping, pressure vessels and distillation towers being erected, module lifts, flare stacks and industrial complexity.', preview: scRefineryBuild.url },
  { id: 'renewable-farm', label: { en: 'Solar / Wind Farm Construction', }, icon: '☀️', group: G_CONSTRUCTION, prompt: 'Renewable energy construction environment: cranes raising towering wind turbine sections and blades, rows of solar panels being installed across open land under a wide sky.', preview: scRenewableFarm.url },
  { id: 'site-survey', label: { en: 'Site Groundbreaking / Survey', }, icon: '📐', group: G_CONSTRUCTION, prompt: 'Site groundbreaking and survey environment: surveyors with total stations and tripods, marking stakes and string lines across cleared land, early-stage bare ground with heavy equipment arriving.', preview: scSiteSurvey.url },
  { id: 'deep-piling', label: { en: 'Deep Foundation Piling', }, icon: '🪛', group: G_CONSTRUCTION, prompt: 'Deep foundation piling environment: tall piling rigs driving steel and concrete piles deep into the ground, rhythmic hammering, mud, drilling augers and reinforced pile caps.', preview: scDeepPiling.url },
  { id: 'formwork-shuttering', label: { en: 'Formwork & Shuttering', }, icon: '🪜', group: G_CONSTRUCTION, prompt: 'Formwork and shuttering environment: intricate timber and metal formwork panels assembled for columns and slabs, props and shoring towers, workers aligning shutters before a pour.', preview: scFormworkShuttering.url },
  { id: 'precast-yard', label: { en: 'Precast Concrete Yard', }, icon: '🧊', group: G_CONSTRUCTION, prompt: 'Precast concrete yard environment: rows of factory-cast beams, panels and hollow-core slabs stacked in a storage yard, gantry cranes moving elements and steam-cured concrete surfaces.', preview: scPrecastYard.url },
  { id: 'masonry-brick', label: { en: 'Masonry & Bricklaying', }, icon: '🧱', group: G_CONSTRUCTION, prompt: 'Masonry and bricklaying environment: workers laying bricks and blocks in neat courses, mortar troweled between joints, string lines and rising walls with textured brickwork detail.', preview: scMasonryBrick.url },
  { id: 'structural-welding', label: { en: 'Structural Welding Close-up', }, icon: '🔥', group: G_CONSTRUCTION, prompt: 'Structural welding close-up environment: intense arc-welding sparks flying off steel joints, glowing molten metal, welder in protective gear and dramatic high-contrast light on heavy beams.', preview: scStructuralWelding.url },
  { id: 'curtain-wall', label: { en: 'Glass Curtain Wall Install', }, icon: '🪟', group: G_CONSTRUCTION, prompt: 'Glass curtain wall installation environment: large reflective glazing panels being lifted by suction cranes and fixed onto a building facade, mullion grids and mirrored sky reflections.', preview: scCurtainWall.url },
  { id: 'roofing-waterproofing', label: { en: 'Roofing & Waterproofing', }, icon: '🏠', group: G_CONSTRUCTION, prompt: 'Roofing and waterproofing environment: workers laying membranes, tiles and insulation across a rooftop, torch-on sealing, exposed trusses and safety harnesses against the sky.', preview: scRoofingWaterproofing.url },
  { id: 'mep-install', label: { en: 'MEP / Pipes & Ducts Install', }, icon: '🔧', group: G_CONSTRUCTION, prompt: 'MEP installation environment: overhead runs of HVAC ducts, pipes and cable trays being fitted through an unfinished ceiling, workers on lifts connecting mechanical services.', preview: scMepInstall.url },
  { id: 'electrical-wiring', label: { en: 'Electrical Wiring & Conduit', }, icon: '⚡', group: G_CONSTRUCTION, prompt: 'Electrical wiring environment: electricians pulling colorful cables through conduits, distribution boards and busbars being wired, exposed junction boxes across a building under fit-out.', preview: scElectricalWiring.url },
  { id: 'interior-fitout', label: { en: 'Interior Fit-Out / Drywall', }, icon: '🚪', group: G_CONSTRUCTION, prompt: 'Interior fit-out environment: metal stud framing and drywall partitions being erected, plasterboard sheets, taping and dust, an unfinished interior taking shape under work lights.', preview: scInteriorFitout.url },
  { id: 'plastering-finishing', label: { en: 'Plastering & Finishing', }, icon: '🎨', group: G_CONSTRUCTION, prompt: 'Plastering and finishing environment: workers skimming smooth plaster onto walls, sanding and painting, clean matte surfaces emerging in a near-complete interior.', preview: scPlasteringFinishing.url },
  { id: 'elevator-shaft', label: { en: 'Elevator / Lift Shaft Work', }, icon: '🛗', group: G_CONSTRUCTION, prompt: 'Elevator shaft construction environment: a deep vertical concrete shaft with guide rails, hoist cables and technicians installing the lift car and machinery under dramatic top light.', preview: scElevatorShaft.url },
  { id: 'metro-railway', label: { en: 'Metro / Railway Construction', }, icon: '🚆', group: G_CONSTRUCTION, prompt: 'Metro and railway construction environment: track ballast and rails being laid, sleepers aligned, overhead catenary masts and tunnel or viaduct sections with heavy rail machinery.', preview: scMetroRailway.url },
  { id: 'airport-runway', label: { en: 'Airport / Runway Construction', }, icon: '🛬', group: G_CONSTRUCTION, prompt: 'Airport runway construction environment: vast concrete and asphalt paving stretching to the horizon, line-marking crews, graders and rollers on a massive flat airfield site.', preview: scAirportRunway.url },
  { id: 'port-marine', label: { en: 'Port & Marine Works', }, icon: '⚓', group: G_CONSTRUCTION, prompt: 'Port and marine construction environment: quay walls and jetties being built over water, piling barges, gantry cranes and concrete caissons against the sea.', preview: scPortMarine.url },
  { id: 'canal-water', label: { en: 'Canal / Water Infrastructure', }, icon: '💧', group: G_CONSTRUCTION, prompt: 'Water infrastructure construction environment: concrete canals, culverts and treatment basins under construction, diversion channels, formwork and earth-moving along waterways.', preview: scCanalWater.url },
  { id: 'pipeline-laying', label: { en: 'Pipeline Laying', }, icon: '🧯', group: G_CONSTRUCTION, prompt: 'Pipeline laying environment: long trenches with large steel pipes being welded and lowered by sidebooms across open terrain, coating stations and a linear construction spread.', preview: scPipelineLaying.url },
  { id: 'power-plant', label: { en: 'Power Plant Construction', }, icon: '🏭', group: G_CONSTRUCTION, prompt: 'Power plant construction environment: massive turbine halls, cooling towers and boiler structures under erection, thick pipework, cranes and monumental industrial scale.', preview: scPowerPlant.url },
  { id: 'warehouse-logistics', label: { en: 'Warehouse / Logistics Build', }, icon: '🏬', group: G_CONSTRUCTION, prompt: 'Warehouse and logistics construction environment: huge steel portal frames and cladding of a distribution center, vast concrete floor slabs and long-span roof structures.', preview: scWarehouseLogistics.url },
  { id: 'stadium-arena', label: { en: 'Stadium / Arena Construction', }, icon: '🏟️', group: G_CONSTRUCTION, prompt: 'Stadium and arena construction environment: sweeping curved roof trusses and tiered concrete seating bowls under construction, giant cranes and dramatic structural geometry.', preview: scStadiumArena.url },
  { id: 'night-construction', label: { en: 'Nighttime Construction Site', }, icon: '🌙', group: G_CONSTRUCTION, prompt: 'Nighttime construction environment: a site lit by powerful floodlights and machinery headlights, glowing dust, long shadows, welding sparks and cranes silhouetted against a dark sky.', preview: scNightConstruction.url },
  // Urban & Modern
  { id: 'megacity-corporate', label: { en: 'Megacity Corporate' }, icon: '🏙️', group: G_URBAN, prompt: 'Megacity corporate environment: giant glass skyscrapers, clouds reflecting on the glass and a sleek upscale business atmosphere.', preview: scMegacityCorporate.url },
  { id: 'cyberpunk-alleyway', label: { en: 'Cyberpunk Alleyway', }, icon: '🌃', group: G_URBAN, prompt: 'Cyberpunk alleyway environment: crowded narrow streets at night, multilingual neon signs, hanging wires and street-food kiosks.', preview: scCyberpunkAlleyway.url },
  { id: 'subway-station', label: { en: 'Subway / Underground Station', }, icon: '🚇', group: G_URBAN, prompt: 'Subway station environment: dark tunnels, fast moving trains with motion blur and concrete platforms under fluorescent light.', preview: scSubwayStation.url },
  { id: 'rooftop-overlook', label: { en: 'Rooftop Overlook', }, icon: '🌆', group: G_URBAN, prompt: 'Rooftop overlook environment: the edge of a tall tower rooftop at night while the whole city lights glow in the background with cinematic bokeh.', preview: scRooftopOverlook.url },
  // Natural & Epic Landscapes
  { id: 'epic-mountain', label: { en: 'Epic Mountain Range', }, icon: '🏔️', group: G_NATURE, prompt: 'Epic mountain range environment: sharp snowy peaks, thick fog in the valleys and steep cliffs.', preview: scEpicMountain.url },
  { id: 'apocalyptic-wasteland', label: { en: 'Post-Apocalyptic Wasteland', }, icon: '🏜️', group: G_NATURE, prompt: 'Post-apocalyptic wasteland environment: endless sand plains, abandoned worn vehicles, dusty sky and a scorching sun.', preview: scApocalypticWasteland.url },
  { id: 'mystical-forest', label: { en: 'Deep Mystical Forest', }, icon: '🌲', group: G_NATURE, prompt: 'Deep mystical forest environment: ancient tall trees, dense foliage, light filtered through leaves reaching the ground and a misty atmosphere.', preview: scMysticalForest.url },
  { id: 'arctic-tundra', label: { en: 'Arctic Tundra / Ice Landscape', }, icon: '❄️', group: G_NATURE, prompt: 'Arctic tundra ice landscape environment: endless white plains, ice caves with blue light reflections and a snowstorm.', preview: scArcticTundra.url },
  // Historical & Fantasy
  { id: 'medieval-castle', label: { en: 'Medieval Castle / Citadel', }, icon: '🏰', group: G_HISTORICAL, prompt: 'Medieval castle environment: large stone walls, lit torches on the walls and dark halls with long wooden tables.', preview: scMedievalCastle.url },
  { id: 'ancient-ruins', label: { en: 'Ancient Ruins', }, icon: '🏛️', group: G_HISTORICAL, prompt: 'Ancient ruins environment: cracked Greek or Egyptian stone columns covered in vines, set in a desert or forest.', preview: scAncientRuins.url },
  { id: 'gothic-cathedral', label: { en: 'Gothic Cathedral', }, icon: '⛪', group: G_HISTORICAL, prompt: 'Gothic cathedral environment: pointed architecture and large stained-glass windows casting colorful light into a vast dark hall.', preview: scGothicCathedral.url },
  { id: 'steampunk-workshop', label: { en: 'Steampunk Workshop', }, icon: '⚙️', group: G_HISTORICAL, prompt: 'Steampunk workshop environment: copper pipes, gauge dials, steam and intricate 19th-century mechanical tools.', preview: scSteampunkWorkshop.url },
  // Interior & Moody
  { id: 'jazz-club', label: { en: 'Dimly Lit Jazz Club', }, icon: '🎷', group: G_INTERIOR, prompt: 'Dimly lit jazz club environment: a cozy space, cigarette smoke hanging in spot lighting, shiny brass instruments and dark leather furniture.', preview: scJazzClub.url },
  { id: 'dark-academia-library', label: { en: 'Dark Academia Library', }, icon: '📚', group: G_INTERIOR, prompt: 'Dark academia library environment: tall wooden shelves full of old leather books, study desks with green lamps and the scent of old paper.', preview: scDarkAcademiaLibrary.url },
  { id: 'retro-diner', label: { en: 'Retro Diner', }, icon: '🍔', group: G_INTERIOR, prompt: 'Retro 80s diner environment: red leather booths, neon interior decor, a jukebox and rain-streaked windows at night.', preview: scRetroDiner.url },
]

const SCENE_GROUPS = Array.from(new Set(SCENE_TEMPLATES.map((s) => s.group.en)))
const SCENE_GROUP_LOC: Record<string, Loc> = Object.fromEntries(
  SCENE_TEMPLATES.map((s) => [s.group.en, s.group]),
)

type VideoTemplate = {
  id: string
  label: Loc
  icon: string
  group: Loc
  prompt: string
  preview?: string
}

const VG_SPORTS: Loc = { en: 'Sports & Action', }
const VG_ANIMATION: Loc = { en: 'Animation & Motion Graphics', }
const VG_SOCIAL: Loc = { en: 'Social Media', }
const VG_CORPORATE: Loc = { en: 'Corporate & Business', }
const VG_CINEMATIC: Loc = { en: 'Cinematic & Creative', }
const VG_EVENTS: Loc = { en: 'Events & Occasions', }
const VG_EXPLAINER: Loc = { en: 'Explainer & Educational', }

const VIDEO_TEMPLATES: VideoTemplate[] = [
  // 1. Sports & Action
  { id: 'football-team', label: { en: 'Football / Team Sports' }, icon: '⚽', group: VG_SPORTS, prompt: 'Sports broadcast template: team line-up reveals, player profile cards, animated live-score lower thirds and refereeing graphics with energetic stadium atmosphere.', preview: vtFootballTeam.url },
  { id: 'sports-highlights', label: { en: 'Sports Highlights', }, icon: '🏆', group: VG_SPORTS, prompt: 'Sports highlights template: fast transitions, high-energy effects and jump cuts to showcase goals and decisive match moments.', preview: vtSportsHighlights.url },
  { id: 'fitness', label: { en: 'Fitness & Bodybuilding', }, icon: '💪', group: VG_SPORTS, prompt: 'Fitness template: motivational footage cut to a fast music tempo, promoting gyms or training programs with dynamic energy.', preview: vtFitness.url },
  { id: 'gaming-esports', label: { en: 'Gaming / Esports', }, icon: '🎮', group: VG_SPORTS, prompt: 'Gaming and esports template: stream channel intros, on-screen overlays and team reveals with neon glowing effects.', preview: vtGamingEsports.url },
  // 2. Animation & Motion Graphics
  { id: 'explainer', label: { en: 'Explainer Video', }, icon: '🧩', group: VG_ANIMATION, prompt: '2D/3D explainer template: animated characters explaining a system, product or service with clean motion graphics.', preview: vtExplainer.url },
  { id: 'logo-reveal', label: { en: 'Logo Reveal', }, icon: '✨', group: VG_ANIMATION, prompt: 'Logo reveal template: short, eye-catching few-second animation introducing a brand logo at the start of videos.', preview: vtLogoReveal.url },
  { id: 'kinetic-typography', label: { en: 'Kinetic Typography', }, icon: '🔤', group: VG_ANIMATION, prompt: 'Kinetic typography template: built entirely on creative, rhythmic animated text synced to the beat.', preview: vtKineticTypography.url },
  { id: 'motion-comic', label: { en: 'Motion Comics', }, icon: '💥', group: VG_ANIMATION, prompt: 'Motion comic template: animated comic-book panels and visual storytelling with painterly comic effects.', preview: vtMotionComic.url },
  // 3. Social Media
  { id: 'youtube-intro-outro', label: { en: 'YouTube Intro & Outro', }, icon: '▶️', group: VG_SOCIAL, prompt: 'YouTube intro/outro template: opening sequences and end screens with animated like and subscribe button prompts.', preview: vtYoutubeIntroOutro.url },
  { id: 'instagram-reels', label: { en: 'Instagram Story / Reels', }, icon: '📱', group: VG_SOCIAL, prompt: 'Vertical 9:16 template: minimal, e-commerce or lifestyle designs for quick product showcases in stories and reels.', preview: vtInstagramReels.url },
  { id: 'tiktok-trends', label: { en: 'TikTok & Trends', }, icon: '🎵', group: VG_SOCIAL, prompt: 'TikTok trend template: beat-synced edits and viral transitions matched to the music.', preview: vtTiktokTrends.url },
  { id: 'vodcast', label: { en: 'Video Podcast (Vodcast)', }, icon: '🎙️', group: VG_SOCIAL, prompt: 'Video podcast template: audio spectrum visualizer and timer overlays for publishing podcasts.', preview: vtVodcast.url },
  // 4. Corporate & Business
  { id: 'company-profile', label: { en: 'Company Profile' }, icon: '🏢', group: VG_CORPORATE, prompt: 'Company profile template: history and goals timeline, leadership team introductions and business vision presentation.', preview: vtCompanyProfile.url },
  { id: 'infographic', label: { en: 'Presentation / Infographic', }, icon: '📊', group: VG_CORPORATE, prompt: 'Infographic template: animated charts, city or country maps and attractive visual presentation of statistical data.', preview: vtInfographic.url },
  { id: 'real-estate', label: { en: 'Real Estate', }, icon: '🏠', group: VG_CORPORATE, prompt: 'Real estate template: clean professional slideshows with text info to present home details and architecture projects.', preview: vtRealEstate.url },
  { id: 'product-promo', label: { en: 'Product Promo', }, icon: '🛍️', group: VG_CORPORATE, prompt: 'Product promo template: 3D or video showcase of features, price and multiple angles of a new product.', preview: vtProductPromo.url },
  // 5. Cinematic & Creative
  { id: 'movie-trailer', label: { en: 'Movie Trailer / Teaser', }, icon: '🎬', group: VG_CINEMATIC, prompt: 'Cinematic trailer template: epic dramatic titles, light effects and dark atmospheric mood.', preview: vtMovieTrailer.url },
  { id: 'photo-slideshow', label: { en: 'Photo / Video Slideshow', }, icon: '🖼️', group: VG_CINEMATIC, prompt: 'Slideshow template: artistic blend of images with soft music, suited for portfolios or travel memories.', preview: vtPhotoSlideshow.url },
  { id: 'glitch-retro', label: { en: 'Glitch & Retro', }, icon: '📼', group: VG_CINEMATIC, prompt: 'Glitch and retro template: VHS tape simulation, old TV noise and 80s/90s visual styling.', preview: vtGlitchRetro.url },
  { id: 'vfx', label: { en: 'VFX / Special Effects', }, icon: '🌩️', group: VG_CINEMATIC, prompt: 'VFX template: ready-made explosions, magic, smoke, fire and weather changes layered over raw footage.', preview: vtVfx.url },
  // 6. Events & Occasions
  { id: 'wedding', label: { en: 'Wedding & Formal', }, icon: '💍', group: VG_EVENTS, prompt: 'Wedding template: romantic slideshows with warm color grading, floral frames, delicate typography and soft light leaks.', preview: vtWedding.url },
  { id: 'birthday-party', label: { en: 'Birthday & Party', }, icon: '🎉', group: VG_EVENTS, prompt: 'Birthday and party template: colorful, joyful video invitations with balloon and confetti animations.', preview: vtBirthdayParty.url },
  { id: 'calendar-campaigns', label: { en: 'Holidays & Campaigns', }, icon: '🎄', group: VG_EVENTS, prompt: 'Seasonal campaign template: tailored for Christmas, Halloween, Nowruz, Ramadan, Black Friday and seasonal discount sales.', preview: vtCalendarCampaigns.url },
  // 7. Explainer & Educational
  { id: 'whiteboard', label: { en: 'Whiteboard Animation', }, icon: '✍️', group: VG_EXPLAINER, prompt: 'Whiteboard animation template: a visible hand drawing simple sketches and text on a white board, building the explanation step by step with marker strokes.', preview: vtWhiteboard.url },
  { id: 'blackboard', label: { en: 'Blackboard Animation', }, icon: '🟢', group: VG_EXPLAINER, prompt: 'Blackboard animation template: chalk-style white and colored drawings appearing on a dark blackboard, nostalgic classroom feel with hand-drawn diagrams.', preview: vtBlackboard.url },
  { id: 'glassboard', label: { en: 'Glassboard Animation', }, icon: '🟩', group: VG_EXPLAINER, prompt: 'Glassboard animation template: a real presenter behind a transparent glass writing with glowing neon markers, mirrored so the text reads correctly, dark studio background.', preview: vtGlassboard.url },
  { id: 'line-art', label: { en: 'Line Art Animation', }, icon: '〰️', group: VG_EXPLAINER, prompt: 'Line art animation template: continuous single-line illustrations with no fill, lines flowing smoothly and morphing from one shape into the next.', preview: vtLineArt.url },
  { id: 'infographic-motion', label: { en: 'Infographic Animation', }, icon: '📊', group: VG_EXPLAINER, prompt: 'Infographic animation template: animated charts, graphs, percentages and data visualizations that bring statistics to life for easy digestion.', preview: vtInfographicMotion.url },
  { id: 'flat-2d', label: { en: '2D Flat Animation', }, icon: '🟦', group: VG_EXPLAINER, prompt: '2D flat animation template: solid flat colors, no complex shadows and simple clean characters, ideal for startup explainer videos.', preview: vtFlat2d.url },
  { id: 'isometric', label: { en: 'Isometric Animation', }, icon: '📐', group: VG_EXPLAINER, prompt: 'Isometric animation template: 2D illustrations drawn at a 30-degree angle to convey depth, great for showing cities, system architecture and technology.', preview: vtIsometric.url },
  { id: 'character-2d', label: { en: '2D Character Animation', }, icon: '🧍', group: VG_EXPLAINER, prompt: '2D character animation template: a central character facing a problem, then the product or idea introduced as the solution, narrative-driven storytelling.', preview: vtCharacter2d.url },
  { id: 'cut-out', label: { en: 'Cut-out Animation', }, icon: '✂️', group: VG_EXPLAINER, prompt: 'Cut-out animation template: characters and environments built from cut paper or cardboard pieces, giving a playful handmade crafty feel.', preview: vtCutOut.url },
  { id: 'stop-motion', label: { en: 'Stop Motion', }, icon: '🧩', group: VG_EXPLAINER, prompt: 'Stop motion template: frame-by-frame photography of real objects like clay, Lego or everyday items, played fast to create the illusion of movement.', preview: vtStopMotion.url },
  { id: 'screencast-ui', label: { en: 'Screencast / UI Animation' }, icon: '🖥️', group: VG_EXPLAINER, prompt: 'Screencast / UI animation template: an app or website interface shown with smooth animated buttons, menus and zoom highlights instead of a plain screen recording.', preview: vtScreencastUi.url },
  { id: 'live-action-tracked', label: { en: 'Live-Action + Tracked Graphics', }, icon: '🎞️', group: VG_EXPLAINER, prompt: 'Live-action with tracked elements template: real footage of people or environments with 3D floating graphics, numbers and text tracked into the scene.', preview: vtLiveActionTracked.url },
]

const VIDEO_GROUPS = Array.from(new Set(VIDEO_TEMPLATES.map((v) => v.group.en)))
const VIDEO_GROUP_LOC: Record<string, Loc> = Object.fromEntries(
  VIDEO_TEMPLATES.map((v) => [v.group.en, v.group]),
)

const T: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Product Ad Scenario',
    description:
      'Add your product photo and name, answer a few questions, and get a cinematic advertising scenario tuned to your chosen camera style.',
    photo: 'Photo',
    productName: 'Product name',
    productNamePlaceholder: 'e.g. AuraGlow Serum',
    descriptionLabel: 'Description',
    optional: '(optional)',
    descriptionPlaceholder: 'Key features, vibe, target audience…',
    yourPrompt: 'Your prompt',
    yourPromptPlaceholder:
      'Write your own prompt / idea — it will be rewritten for your selected duration and camera style…',
    duration: 'Duration',
    cameraStyle: 'Camera style',
    genre: 'Genre & atmosphere',
    scene: 'Scene & environment',
    videoTemplates: 'Video templates',
    cameraNotes: 'Camera movement notes',
    cameraNotesPlaceholder:
      'Describe how the camera should move, e.g. slow rise then fast push-in on the label…',
    adScenario: 'Ad scenario',
    scene_: 'Scene',
    narration: 'Narration',
    copy: 'Copy',
    copyAll: 'Copy all',
    copied: 'Copied',
    regenerate: 'Regenerate',
    sendAll: 'Send all to Pending',
    useAsPrompt: 'Use as prompt',
    preparingFrame: 'Preparing frame…',
    generate: 'Generate ad scenario',
    withNarration: 'With narration',
    withoutNarration: 'Without narration',
    language: 'Language',
    chooseFromProducts: 'Choose from products',
    generateWithAi: 'Generate with AI',
    pickAspect: 'Choose image dimensions',
    pickProduct: 'Choose a product',
    aspectHint: 'Pick the dimensions first, then choose a product.',
    noProducts: 'No saved product photos yet.',
    untitled: 'Untitled',
    preparing: 'Preparing image…',
    loadingProducts: 'Loading products…',
    back: 'Back',
    viewImage: 'View image',
    reframeHistory: 'Previously made images',
    loadingReframes: 'Loading history…',
    noReframes: 'No reframed images yet.',
    reuseHint: 'Click to reuse without regenerating.',
    businessLabel: 'About your business',
    businessRequiredTag: '(required)',
    businessPlaceholder: 'Describe your business: what you sell, your products/services, target audience, and brand tone…',
    businessRequired: 'Please describe your business first — the scenario must be relevant to it.',
    businessSave: 'Save',
    businessSaved: 'Saved',
    contactLabel: 'Contact details (shown on video)',
    contactWebsite: 'Website',
    contactPhone: 'Phone',
    contactAddress: 'Address',
    contactLogo: 'Company logo',
  },
}

// Character Sheet overrides — merged over the product strings when variant === 'character'.
const CHAR_T: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Character Sheet',
    description:
      'Upload your character image, answer a few questions, and get a cinematic film scenario built entirely around that character.',
    photo: 'Character',
    productName: 'Character name',
    productNamePlaceholder: 'e.g. Captain Aria',
    descriptionPlaceholder: 'Personality, role, age, vibe, backstory…',
    generate: 'Generate film scenario',
  },
}

export default function ProductAdDialog({
  open,
  onOpenChange,
  defaultDuration,
  userId,
  variant = 'product',
  onUseAsPrompt,
  onSendScenes,
}: Props) {
  const isCharacter = variant === 'character'
  const [duration, setDuration] = useState<ProductAdDuration>(defaultDuration)
  const [productName, setProductName] = useState('')
  const [nameNeedsReview, setNameNeedsReview] = useState(false)
  const [productDescription, setProductDescription] = useState('')
  const [businessInfo, setBusinessInfo] = useState('')
  const [contactWebsite, setContactWebsite] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactAddress, setContactAddress] = useState('')
  const [contactLogo, setContactLogo] = useState('')
  const [businessSaving, setBusinessSaving] = useState(false)
  const [businessSaved, setBusinessSaved] = useState(false)
  const [businessOpen, setBusinessOpen] = useState(false)
  const [userPrompt, setUserPrompt] = useState('')
  const [cameraStyle, setCameraStyle] = useState<string>(CAMERA_STYLES[0].label.en)
  const [cameraMovement, setCameraMovement] = useState('')
  const [genre, setGenre] = useState<string>('')
  const [scene, setScene] = useState<string>('')
  const [templateIds, setTemplateIds] = useState<Set<string>>(new Set())
  const [lang, setLang] = useState<Lang>('en')
  const [isWriting, setIsWriting] = useState(false)
  const [scenes, setScenes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isPreparingFrame, setIsPreparingFrame] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [previewLightboxOpen, setPreviewLightboxOpen] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [aiImageOpen, setAiImageOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Product picker (choose a saved product photo + reframe to chosen dimensions)
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [pickedAspect, setPickedAspect] = useState<ProductAspect | null>(null)
  const [productPhotos, setProductPhotos] = useState<ProductPhoto[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [preparingId, setPreparingId] = useState<string | null>(null)

  // Reframe history (previously generated reframes the user can reuse)
  const [reframeHistoryOpen, setReframeHistoryOpen] = useState(false)
  const [reframeItems, setReframeItems] = useState<ReframeItem[]>([])
  const [loadingReframes, setLoadingReframes] = useState(false)



  // Character attachment (feature a character in the product ad)
  const characterFileInputRef = useRef<HTMLInputElement | null>(null)
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false)
  const [characterPhotos, setCharacterPhotos] = useState<ProductPhoto[]>([])
  const [loadingCharacters, setLoadingCharacters] = useState(false)
  const [characterRefDisplayUrl, setCharacterRefDisplayUrl] = useState<string | null>(null)
  const [characterRefSendUrl, setCharacterRefSendUrl] = useState<string | null>(null)
  const [characterRefName, setCharacterRefName] = useState<string | null>(null)
  const [uploadingCharacter, setUploadingCharacter] = useState(false)

  async function openCharacterPicker() {
    if (!userId) {
      setError('Please sign in to choose a character.')
      return
    }
    setError(null)
    setCharacterPickerOpen(true)
    setLoadingCharacters(true)
    try {
      const { data, error: qErr } = await supabase
        .from('generator_user_images')
        .select('id, storage_path, title, category')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (qErr) throw new Error(qErr.message)
      const rows = (data ?? []).filter((r) => (r.category ?? 'general') === 'character')
      const photos: ProductPhoto[] = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          title: r.title ?? null,
          url: await signProductPhotoUrl(r.storage_path),
        })),
      )
      setCharacterPhotos(photos)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load characters')
    } finally {
      setLoadingCharacters(false)
    }
  }

  function pickCharacter(photo: ProductPhoto) {
    setCharacterRefDisplayUrl(photo.url)
    setCharacterRefSendUrl(photo.url)
    setCharacterRefName(photo.title ?? null)
    setCharacterPickerOpen(false)
  }

  async function handleUploadCharacter(file: File | undefined) {
    if (!file) return
    if (!userId) {
      setError('Please sign in to attach a character.')
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('Only image files are supported.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image too large (max 10MB).')
      return
    }
    setError(null)
    setUploadingCharacter(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const storagePath = `${userId}/character-ref-${Date.now()}-${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(FRAMES_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { data } = supabase.storage.from(FRAMES_BUCKET).getPublicUrl(storagePath)
      const displayUrl = await signFramesUrl(data.publicUrl).catch(() => data.publicUrl)
      setCharacterRefDisplayUrl(displayUrl)
      setCharacterRefSendUrl(data.publicUrl)
      setCharacterRefName(null)
      setCharacterPickerOpen(false)
    } catch (e) {
      setError((e as Error).message ?? 'Character upload failed')
    } finally {
      setUploadingCharacter(false)
      if (characterFileInputRef.current) characterFileInputRef.current.value = ''
    }
  }

  function clearCharacter() {
    setCharacterRefDisplayUrl(null)
    setCharacterRefSendUrl(null)
    setCharacterRefName(null)
    if (characterFileInputRef.current) characterFileInputRef.current.value = ''
  }



  async function openProductPicker() {
    if (!userId) {
      setError('Please sign in to choose a product.')
      return
    }
    setError(null)
    setPickedAspect(null)
    setProductPickerOpen(true)
    setLoadingProducts(true)
    try {
      const { data, error: qErr } = await supabase
        .from('generator_user_images')
        .select('id, storage_path, title, category')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (qErr) throw new Error(qErr.message)
      const rows = (data ?? []).filter((r) => (r.category ?? 'general') === 'product')
      // user-images is a PRIVATE bucket, so getPublicUrl returns broken links.
      // Resolve a signed URL for every product (same approach as the Storage modal).
      const photos: ProductPhoto[] = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          title: r.title ?? null,
          url: await signProductPhotoUrl(r.storage_path),
        })),
      )
      setProductPhotos(photos)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load products')
    } finally {
      setLoadingProducts(false)
    }
  }

  async function pickProduct(photo: ProductPhoto) {
    if (!pickedAspect || preparingId) return
    setError(null)
    setPreparingId(photo.id)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      if (!token) throw new Error('You are signed out. Please sign in again.')
      const resp = await fetch(`${FUNCTIONS_BASE}/image-reframe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: photo.url, aspectRatio: pickedAspect }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(json?.error || `Request failed (${resp.status})`)
      // `wan-frames` is private — the function's public URL is broken under the
      // workspace public-buckets policy. Sign the returned object path instead.
      const reframedPath = (json.path as string) || (json.publicUrl as string)
      setPreviewError(null)
      setPreviewLoading(true)
      const signedPreview = await signFramesUrl(reframedPath)
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
      setImagePreviewUrl(signedPreview)
      // Generation pipeline still receives the function's public URL (validator
      // contract is unchanged); only the preview uses a signed URL.
      setUploadedImageUrl((json.publicUrl as string) ?? signedPreview)
      const cleaned = cleanProductName(photo.title)
      if (!productName.trim() && photo.title) setProductName(cleaned)
      setNameNeedsReview(looksLikeCode(cleaned))
      // Record this reframe so it appears in the history gallery and can be
      // reused later without paying for another generation.
      try {
        const dims = ASPECT_DIMS[pickedAspect]
        await supabase.from('generator_user_images').insert({
          user_id: userId!,
          storage_path: (json.publicUrl as string) ?? reframedPath,
          category: 'reframe',
          title: photo.title ?? null,
          width: dims.w,
          height: dims.h,
        })
      } catch {
        /* non-blocking: history record is best-effort */
      }
      setProductPickerOpen(false)
    } catch (e) {
      setPreviewLoading(false)
      setError((e as Error).message ?? 'Failed to prepare image')
    } finally {
      setPreparingId(null)
    }
  }

  async function openReframeHistory() {
    if (!userId) {
      setError('Please sign in to view your images.')
      return
    }
    setError(null)
    setReframeHistoryOpen(true)
    setLoadingReframes(true)
    try {
      const { data, error: qErr } = await supabase
        .from('generator_user_images')
        .select('id, storage_path, title, category, width, height')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (qErr) throw new Error(qErr.message)
      const rows = (data ?? []).filter((r) => (r.category ?? 'general') === 'reframe')
      const items: ReframeItem[] = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          title: r.title ?? null,
          aspect: aspectLabelFromDims(r.width, r.height),
          url: await signFramesUrl(r.storage_path).catch(() => signProductPhotoUrl(r.storage_path)),
        })),
      )
      setReframeItems(items)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load history')
    } finally {
      setLoadingReframes(false)
    }
  }

  async function reuseReframe(item: ReframeItem) {
    setError(null)
    setPreviewError(null)
    setPreviewLoading(true)
    try {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
      setImagePreviewUrl(item.url)
      setUploadedImageUrl(item.url)
      const cleaned = cleanProductName(item.title)
      if (!productName.trim() && item.title) setProductName(cleaned)
      setNameNeedsReview(looksLikeCode(cleaned))
      setReframeHistoryOpen(false)
      setProductPickerOpen(false)
    } finally {
      setPreviewLoading(false)
    }
  }





  useEffect(() => {
    if (open) {
      setDuration(defaultDuration)
      setError(null)
    }
  }, [open, defaultDuration])

  useEffect(() => {
    let cancelled = false
    if (open && userId) {
      supabase
        .from('generator_business_profiles')
        .select('business_info, contact_website, contact_phone, contact_address, contact_logo_url')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled || !data) return
          if (data.business_info) setBusinessInfo(data.business_info)
          if (data.contact_website) setContactWebsite(data.contact_website)
          if (data.contact_phone) setContactPhone(data.contact_phone)
          if (data.contact_address) setContactAddress(data.contact_address)
          setContactLogo((data as { contact_logo_url?: string | null }).contact_logo_url ?? '')
        })
    }
    return () => {
      cancelled = true
    }
  }, [open, userId])

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  async function handlePickImage(file: File | undefined) {
    if (!file) return
    if (!userId) {
      setError('Please sign in to attach an image.')
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('Only image files are supported.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image too large (max 10MB).')
      return
    }
    setError(null)
    setPreviewError(null)
    setPreviewLoading(false)
    const localUrl = URL.createObjectURL(file)
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImagePreviewUrl(localUrl)
    setUploadedImageUrl(null)
    setIsUploadingImage(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const storagePath = `${userId}/product-ad-${Date.now()}-${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(FRAMES_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { data } = supabase.storage.from(FRAMES_BUCKET).getPublicUrl(storagePath)
      setUploadedImageUrl(data.publicUrl)
    } catch (e) {
      setError((e as Error).message ?? 'Image upload failed')
      setImagePreviewUrl(null)
      setUploadedImageUrl(null)
    } finally {
      setIsUploadingImage(false)
    }
  }

  function clearImage() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImagePreviewUrl(null)
    setUploadedImageUrl(null)
    setPreviewError(null)
    setPreviewLoading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function saveBusinessInfo() {
    if (!businessInfo.trim()) {
      setError(t.businessRequired)
      return
    }
    if (!userId) return
    setBusinessSaving(true)
    setBusinessSaved(false)
    try {
      const { error: upErr } = await supabase
        .from('generator_business_profiles')
        .upsert({
          user_id: userId,
          business_info: businessInfo.trim(),
          contact_website: contactWebsite.trim() || null,
          contact_phone: contactPhone.trim() || null,
          contact_address: contactAddress.trim() || null,
          contact_logo_url: contactLogo || null,
        }, { onConflict: 'user_id' })
      if (upErr) {
        setError(upErr.message)
        return
      }
      setBusinessSaved(true)
      setError(null)
      setTimeout(() => setBusinessSaved(false), 1500)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to save')
    } finally {
      setBusinessSaving(false)
    }
  }

  // Read an uploaded logo, downscale it to <=256px (PNG data URL), and store it.
  function onContactLogoFile(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new window.Image()
      img.onload = () => {
        const max = 256
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, w, h)
        setContactLogo(canvas.toDataURL('image/png'))
        setBusinessSaved(false)
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }


  function handleAiImageSaved(row: AiImageSavedRow) {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setError(null)
    setImagePreviewUrl(row.storage_path)
    setUploadedImageUrl(row.storage_path)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function generate(withNarration = true) {
    if (isWriting) return
    if (!businessInfo.trim()) {
      setError(t.businessRequired)
      return
    }
    if (isCharacter) {
      if (!uploadedImageUrl) {
        setError('Please upload a character image first.')
        return
      }
    } else if (!userPrompt.trim() && !productName.trim() && !uploadedImageUrl) {
      setError('Write a prompt, add a product name, or attach a product photo.')
      return
    }
    if (userId) {
      setBusinessSaving(true)
      try {
        await supabase
          .from('generator_business_profiles')
          .upsert({
            user_id: userId,
            business_info: businessInfo.trim(),
            contact_website: contactWebsite.trim() || null,
            contact_phone: contactPhone.trim() || null,
            contact_address: contactAddress.trim() || null,
            contact_logo_url: contactLogo || null,
          }, { onConflict: 'user_id' })
      } catch {
        /* non-fatal: still attempt generation */
      } finally {
        setBusinessSaving(false)
      }
    }
    setIsWriting(true)
    setError(null)
    setScenes([])
    setError(null)
    setScenes([])
    try {
      const trimmedPrompt = userPrompt.trim()
      const trimmedName = productName.trim()
      const templatePrompts = VIDEO_TEMPLATES.filter((v) => templateIds.has(v.id))
        .map((v) => v.prompt)
        .join(' ')
      const subjectWord = isCharacter ? 'character' : 'product'
      let idea = trimmedPrompt
        ? trimmedName
          ? `${trimmedPrompt}\n\nThis is a film built around the ${subjectWord} "${trimmedName}".`
          : trimmedPrompt
        : trimmedName
          ? isCharacter
            ? `A film built around the character "${trimmedName}".`
            : `Advertisement for the product "${trimmedName}".`
          : isCharacter
            ? 'A film built around the character in the attached image.'
            : 'Advertisement for the attached product.'
      if (templatePrompts) {
        idea += `\n\nFollow these video template styles and conventions: ${templatePrompts}`
      }
      const useCharacter = !isCharacter && Boolean(characterRefSendUrl)
      if (useCharacter) {
        idea += characterRefName
          ? `\n\nThis advertisement features a recurring on-screen character named "${characterRefName}" (see the second attached image). Keep this character's look (face, hair, wardrobe, body) consistent in every shot, while the product stays the hero.`
          : `\n\nThis advertisement features a recurring on-screen character (see the second attached image). Keep this character's look (face, hair, wardrobe, body) consistent in every shot, while the product stays the hero.`
      }
      const { data, error: invokeErr } = await supabase.functions.invoke('scenario-write', {
        body: {
          mode: isCharacter ? 'character-sheet' : 'product-ad',
          idea,
          businessInfo: businessInfo.trim(),
          outputLanguage: lang,
          narration: withNarration,
          durationSeconds: duration,
          imageUrl: uploadedImageUrl ?? undefined,
          ...(isCharacter
            ? {
                characterName: productName.trim() || undefined,
                characterDescription: productDescription.trim() || undefined,
              }
            : {
                productName: productName.trim() || undefined,
                productDescription: productDescription.trim() || undefined,
                characterImageUrl: useCharacter ? (characterRefSendUrl ?? undefined) : undefined,
              }),
          cameraStyle,
          cameraMovement: cameraMovement.trim() || undefined,
          genre: GENRE_TEMPLATES.find((g) => g.id === genre)?.prompt || undefined,
          scene: SCENE_TEMPLATES.find((s) => s.id === scene)?.prompt || undefined,
        },
      })
      if (invokeErr) {
        setError(invokeErr.message || 'Failed to write scenario')
        return
      }
      const payload = data as { scenario?: string; scenes?: string[]; warning?: string } | null
      const list = (payload?.scenes ?? []).map((s) => s.trim()).filter(Boolean)
      if (list.length === 0) {
        setError('Empty AI response')
        return
      }
      setScenes(list)
      if (payload?.warning) setError(payload.warning)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to write ad scenario')
    } finally {
      setIsWriting(false)
    }
  }

  async function copyText(text: string, idx: number) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(idx)
      setTimeout(() => setCopiedIndex((c) => (c === idx ? null : c)), 1500)
    } catch {
      /* noop */
    }
  }

  /**
   * Build a fetchable start-frame image for the video:
   * - product ad with a character → compose character + product into one opening frame
   * - product ad without a character → the signed product image
   * - character film → the signed character image
   * Returns undefined when no usable image is available.
   */
  async function buildFirstFrame(): Promise<string | undefined> {
    // Resolve a fetchable URL for an image that may live in wan-frames or user-images.
    const signAny = async (url: string): Promise<string> => {
      try {
        return await signFramesUrl(url)
      } catch {
        try {
          return await signProductPhotoUrl(url)
        } catch {
          return imagePreviewUrl ?? url
        }
      }
    }

    // Character film variant: use the character image itself.
    if (isCharacter) {
      if (!uploadedImageUrl) return undefined
      return await signAny(uploadedImageUrl)
    }


    // Product ad with an attached character → compose a combined opening frame.
    if (uploadedImageUrl && characterRefSendUrl) {
      try {
        const composePrompt =
          'Image 1 is the PRODUCT. Image 2 is the on-screen CHARACTER / presenter. ' +
          'Compose a single photorealistic opening advertisement frame in which the character is presenting or holding the product, with the product clearly visible as the hero of the shot. ' +
          'Keep the character\'s face, hair, wardrobe and body identical to image 2, and keep the product\'s exact shape, colors and label from image 1. ' +
          'The final image MUST NOT contain any added text, captions, titles, subtitles, slogans, typography, watermarks, logos, or UI overlays of any kind. ' +
          'Output a clean photographic frame only. The only writing allowed is the product\'s own real label that physically exists on the product in image 1.'
        const { data, error: fnErr } = await supabase.functions.invoke('ai-image-edit', {
          body: { prompt: composePrompt, imageUrls: [uploadedImageUrl, characterRefSendUrl] },
        })
        if (fnErr) throw new Error(fnErr.message || 'Failed to compose frame')
        const dataUrl = (data as { dataUrl?: string } | null)?.dataUrl
        if (dataUrl) return dataUrl
        throw new Error('The AI did not return a composed frame.')
      } catch (e) {
        // Surface the issue but fall back to the product image so the flow still works.
        setError((e as Error).message ?? 'Could not compose the character frame; using the product image instead.')
      }
    }

    // Product ad without a character (or compose failed) → signed product image.
    if (uploadedImageUrl) {
      return await signAny(uploadedImageUrl)
    }
    return undefined
  }

  /**
   * The clean identity anchors for the generation. These are kept separate from
   * the composed opening frame so that the Product Identity is never
   * contaminated with the combined product+character frame.
   */
  async function buildIdentity(): Promise<ProductAdIdentity> {
    const identity: ProductAdIdentity = {}
    if (!isCharacter && uploadedImageUrl) {
      try {
        identity.productRefUrl = await signProductPhotoUrl(uploadedImageUrl)
      } catch {
        identity.productRefUrl = uploadedImageUrl
      }
    }
    if (characterRefSendUrl) identity.characterRefUrl = characterRefSendUrl
    if (productName.trim()) identity.productName = productName.trim()
    return identity
  }

  async function handleUseAsPrompt() {
    if (scenes.length === 0 || isPreparingFrame) return
    setIsPreparingFrame(true)
    setError(null)
    try {
      const frameUrl = await buildFirstFrame()
      const identity = await buildIdentity()
      onUseAsPrompt(scenes.join('\n\n'), frameUrl, duration, identity)
      onOpenChange(false)
    } finally {
      setIsPreparingFrame(false)
    }
  }

  async function handleSendAll() {
    if (scenes.length < 2 || !onSendScenes || isSending) return
    setIsSending(true)
    setError(null)
    try {
      const frameUrl = await buildFirstFrame()
      const identity = await buildIdentity()
      await onSendScenes(scenes, frameUrl, duration, identity)
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message ?? 'Failed to send to Pending')
    } finally {
      setIsSending(false)
    }
  }


  function toggleTemplate(id: string) {
    setTemplateIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function reset() {
    setProductName('')
    setNameNeedsReview(false)
    setProductDescription('')
    setUserPrompt('')
    setCameraStyle(CAMERA_STYLES[0].label.en)
    setCameraMovement('')
    setGenre('')
    setScene('')
    setTemplateIds(new Set())
    setScenes([])
    setError(null)
    setCopiedIndex(null)
    setIsSending(false)
    clearImage()
    clearCharacter()
  }

  const isSplit = SPLIT_DURATIONS.includes(duration) && scenes.length > 1
  const concatenated = scenes.join('\n\n')
  const canGenerate = Boolean(businessInfo.trim()) && (isCharacter
    ? Boolean(uploadedImageUrl) && !isUploadingImage
    : (userPrompt.trim().length > 0 || productName.trim().length > 0 || Boolean(uploadedImageUrl)) && !isUploadingImage)
  const t = isCharacter ? { ...T[lang], ...CHAR_T[lang] } : T[lang]
  const dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr'

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent dir={dir} className="max-w-2xl border-white/10 bg-[#0b0c0e]/95 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCharacter ? (
              <Drama className="h-5 w-5 text-amber-300" aria-hidden="true" />
            ) : (
              <Package className="h-5 w-5 text-amber-300" aria-hidden="true" />
            )}
            {t.title}
            <div className="ms-auto flex items-center gap-2">
              <Popover open={businessOpen} onOpenChange={setBusinessOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label={t.businessLabel}
                    title={t.businessLabel}
                    className={`relative inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
                      businessInfo.trim()
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                        : 'border-amber-300/40 bg-amber-300/10 text-amber-300'
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {!businessInfo.trim() && (
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[28rem] max-w-[92vw] border-white/10 bg-[#0b0c0e] text-zinc-100">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-300">
                    {t.businessLabel} <span className="text-amber-300">{t.businessRequiredTag}</span>
                  </div>
                  <Textarea
                    value={businessInfo}
                    onChange={(e) => {
                      setBusinessInfo(e.target.value)
                      setBusinessSaved(false)
                      if (error) setError(null)
                    }}
                    rows={10}
                    maxLength={undefined}
                    placeholder={t.businessPlaceholder}
                    className="max-h-[55vh] min-h-[220px] resize-y border-white/10 bg-black/30 text-sm text-zinc-100"
                  />
                  <div className="mt-3 mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-300">
                    {t.contactLabel}
                  </div>
                  <div className="space-y-2">
                    <Input
                      value={contactWebsite}
                      onChange={(e) => { setContactWebsite(e.target.value); setBusinessSaved(false) }}
                      placeholder={t.contactWebsite}
                      className="h-9 border-white/10 bg-black/30 text-sm text-zinc-100"
                    />
                    <Input
                      value={contactPhone}
                      onChange={(e) => { setContactPhone(e.target.value); setBusinessSaved(false) }}
                      placeholder={t.contactPhone}
                      className="h-9 border-white/10 bg-black/30 text-sm text-zinc-100"
                    />
                    <Input
                      value={contactAddress}
                      onChange={(e) => { setContactAddress(e.target.value); setBusinessSaved(false) }}
                      placeholder={t.contactAddress}
                      className="h-9 border-white/10 bg-black/30 text-sm text-zinc-100"
                    />
                    <div className="flex items-center gap-2 pt-1">
                      {contactLogo ? (
                        <img
                          src={contactLogo}
                          alt={t.contactLogo}
                          className="h-10 w-10 rounded-md border border-white/15 bg-white/5 object-contain p-0.5"
                        />
                      ) : (
                        <div className="grid h-10 w-10 place-items-center rounded-md border border-dashed border-white/15 bg-black/30 text-zinc-500">
                          <ImagePlus className="h-4 w-4" aria-hidden="true" />
                        </div>
                      )}
                      <label className="cursor-pointer rounded-md border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/30">
                        {contactLogo ? 'Replace' : t.contactLogo}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => { onContactLogoFile(e.target.files?.[0]); e.currentTarget.value = '' }}
                        />
                      </label>
                      {contactLogo ? (
                        <button
                          type="button"
                          onClick={() => { setContactLogo(''); setBusinessSaved(false) }}
                          className="text-[11px] text-zinc-400 transition hover:text-rose-300"
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      onClick={saveBusinessInfo}
                      disabled={businessSaving || !businessInfo.trim()}
                    >
                      {businessSaving ? (
                        <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                      ) : businessSaved ? (
                        <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                      ) : null}
                      {businessSaved ? t.businessSaved : t.businessSave}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
                <SelectTrigger
                  className="h-7 w-auto gap-1.5 rounded-full border-white/10 bg-black/20 px-2.5 text-[11px] font-semibold text-zinc-300"
                  aria-label="Language"
                >
                  <Languages className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANG_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.native}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {t.description}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {/* Product photo + name */}
          <div className="flex items-start gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handlePickImage(e.target.files?.[0])}
            />
            <div className="flex shrink-0 flex-col items-center gap-1.5">
            <div className="relative">
              {/* spacer wrapper */}
              {imagePreviewUrl ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPreviewLightboxOpen(true)}
                    title={t.viewImage}
                    aria-label={t.viewImage}
                    className="block cursor-zoom-in rounded-md"
                  >
                    {previewError ? (
                      <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-1 text-center text-[9px] text-red-200">
                        <X className="h-4 w-4" aria-hidden="true" />
                        <span>{previewError}</span>
                      </div>
                    ) : (
                      <div className="relative h-20 w-20">
                        <img
                          src={imagePreviewUrl}
                          alt="Product"
                          className="h-20 w-20 rounded-md border border-white/10 object-cover transition hover:border-white/30"
                          onLoad={() => setPreviewLoading(false)}
                          onError={() => {
                            setPreviewLoading(false)
                            setPreviewError('Image load error')
                          }}
                        />
                        {previewLoading && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40">
                            <LoaderCircle className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={clearImage}
                    aria-label="Remove image"
                    className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-zinc-200 ring-1 ring-white/20 hover:bg-zinc-800"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  title="Add product photo"
                  aria-label="Add product photo"
                  className="inline-flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-white/15 bg-black/30 text-zinc-400 transition hover:border-amber-300/40 hover:text-amber-100 disabled:opacity-50"
                >
                  {isUploadingImage ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <ImagePlus className="h-5 w-5" aria-hidden="true" />
                  )}
                  <span className="text-[10px]">{t.photo}</span>
                </button>
              )}
            </div>
              {isCharacter ? null : (
                <button
                  type="button"
                  onClick={openProductPicker}
                  title={t.chooseFromProducts}
                  className="inline-flex w-20 items-center justify-center gap-1 rounded-md border border-white/10 bg-black/30 px-1 py-1 text-[10px] text-zinc-300 transition hover:border-amber-300/40 hover:text-amber-100"
                >
                  <Boxes className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="truncate">{t.chooseFromProducts}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setAiImageOpen(true)}
                title={t.generateWithAi}
                className="inline-flex w-20 items-center justify-center gap-1 rounded-md border border-amber-300/30 bg-amber-300/10 px-1 py-1 text-[10px] text-amber-100 transition hover:border-amber-300/60 hover:bg-amber-300/20"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="truncate">{t.generateWithAi}</span>
              </button>
              {isCharacter ? null : (
                characterRefDisplayUrl ? (
                  <div className="relative w-20">
                    <button
                      type="button"
                      onClick={openCharacterPicker}
                      title="Change character"
                      className="block w-20 overflow-hidden rounded-md border border-amber-300/50 bg-amber-300/10"
                    >
                      <img
                        src={characterRefDisplayUrl}
                        alt="Character"
                        className="h-16 w-20 object-cover"
                      />
                      <span className="block truncate px-1 py-0.5 text-[9px] text-amber-100">
                        {characterRefName || 'Character'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={clearCharacter}
                      aria-label="Remove character"
                      className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-zinc-200 ring-1 ring-white/20 hover:bg-zinc-800"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openCharacterPicker}
                    title="Add character"
                    className="inline-flex w-20 items-center justify-center gap-1 rounded-md border border-white/10 bg-black/30 px-1 py-1 text-[10px] text-zinc-300 transition hover:border-amber-300/40 hover:text-amber-100"
                  >
                    <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="truncate">Add character</span>
                  </button>
                )
              )}
            </div>

            <div className="flex-1 space-y-2">
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {t.productName}
                </div>
                <Input
                  value={productName}
                  onChange={(e) => {
                    setProductName(e.target.value)
                    if (nameNeedsReview) setNameNeedsReview(false)
                  }}
                  placeholder={t.productNamePlaceholder}
                  className="border-white/10 bg-black/30 text-zinc-100"
                />
                {nameNeedsReview && (
                  <p className="mt-1.5 text-xs text-amber-400" dir="ltr">
                    This looks like a technical code — please enter the correct product name.
                  </p>
                )}
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {t.descriptionLabel} <span className="text-zinc-600">{t.optional}</span>
                </div>
                <Textarea
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  rows={2}
                  placeholder={t.descriptionPlaceholder}
                  className="min-h-[56px] border-white/10 bg-black/30 text-zinc-100"
                />
              </div>
            </div>
          </div>

          {/* Your prompt */}
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t.yourPrompt} <span className="text-zinc-600">{t.optional}</span>
            </div>
            <Textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              rows={3}
              placeholder={t.yourPromptPlaceholder}
              className="min-h-[72px] border-white/10 bg-black/30 text-zinc-100"
            />
          </div>


          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t.duration}
            </div>
            <div
              role="radiogroup"
              aria-label="Ad duration"
              className="inline-flex rounded-full border border-white/10 bg-black/20 p-1 text-xs font-semibold"
            >
              {DURATIONS.map((sec) => {
                const active = duration === sec
                return (
                  <button
                    key={sec}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDuration(sec)}
                    className={`rounded-full px-3 py-1.5 transition ${
                      active ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {sec}s
                  </button>
                )
              })}
            </div>
            {SPLIT_DURATIONS.includes(duration) ? (
              <p className="mt-2 text-xs text-zinc-500">
                Will be split into {duration / 15} sequential 15s scenes and sent as {duration / 15} cards.
              </p>
            ) : null}
          </div>

          {/* Camera style */}
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t.cameraStyle}
            </div>
            <div role="radiogroup" aria-label="Camera style" className="flex flex-wrap gap-2">
              {CAMERA_STYLES.map((style) => {
                const active = cameraStyle === style.label.en
                return (
                  <StylePreviewCard
                    key={style.label.en}
                    title={tr(style.label, lang)}
                    description={style.desc ? tr(style.desc, lang) : undefined}
                    preview={style.preview}
                    rtl={RTL_LANGS.includes(lang)}
                    selected={active}
                    onSelect={() => setCameraStyle(style.label.en)}
                    selectLabel={tr(SELECT_LABEL, lang)}
                    selectedLabel={tr(SELECTED_LABEL, lang)}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
                          : 'border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <span className="text-sm leading-none">{style.icon}</span>
                      {tr(style.label, lang)}
                    </button>
                  </StylePreviewCard>
                )
              })}
            </div>
          </div>

          {/* Genre & atmosphere */}
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t.genre} <span className="text-zinc-600">{t.optional}</span>
            </div>
            <div role="radiogroup" aria-label="Genre and atmosphere" className="flex flex-wrap gap-2">
              {GENRE_TEMPLATES.map((g) => {
                const active = genre === g.id
                return (
                  <StylePreviewCard
                    key={g.id}
                    title={tr(g.label, lang)}
                    description={g.prompt}
                    preview={g.preview}
                    rtl={RTL_LANGS.includes(lang)}
                    selected={active}
                    onSelect={() => setGenre((cur) => (cur === g.id ? '' : g.id))}
                    selectLabel={tr(SELECT_LABEL, lang)}
                    selectedLabel={tr(SELECTED_LABEL, lang)}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
                          : 'border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <span className="text-sm leading-none">{g.icon}</span>
                      {tr(g.label, lang)}
                    </button>
                  </StylePreviewCard>
                )
              })}
            </div>
          </div>

          {/* Scene & environment */}
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t.scene} <span className="text-zinc-600">{t.optional}</span>
            </div>
            <div className="space-y-2.5">
              {SCENE_GROUPS.map((group) => (
                <div key={group}>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    {tr(SCENE_GROUP_LOC[group], lang)}
                  </div>
                  <div role="radiogroup" aria-label={group} className="flex flex-wrap gap-2">
                    {SCENE_TEMPLATES.filter((s) => s.group.en === group).map((s) => {
                      const active = scene === s.id
                      return (
                        <StylePreviewCard
                          key={s.id}
                          title={tr(s.label, lang)}
                          description={s.prompt}
                          preview={s.preview}
                          rtl={RTL_LANGS.includes(lang)}
                          selected={active}
                          onSelect={() => setScene((cur) => (cur === s.id ? '' : s.id))}
                          selectLabel={tr(SELECT_LABEL, lang)}
                          selectedLabel={tr(SELECTED_LABEL, lang)}
                        >
                          <button
                            type="button"
                            role="radio"
                            aria-checked={active}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                              active
                                ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
                                : 'border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            <span className="text-sm leading-none">{s.icon}</span>
                            {tr(s.label, lang)}
                          </button>
                        </StylePreviewCard>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Video templates */}
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t.videoTemplates} <span className="text-zinc-600">{t.optional}</span>
            </div>
            <div className="space-y-2.5">
              {VIDEO_GROUPS.map((group) => (
                <div key={group}>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    {tr(VIDEO_GROUP_LOC[group], lang)}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {VIDEO_TEMPLATES.filter((v) => v.group.en === group).map((v) => {
                      const active = templateIds.has(v.id)
                      return (
                        <StylePreviewCard
                          key={v.id}
                          title={tr(v.label, lang)}
                          description={v.prompt}
                          preview={v.preview}
                          rtl={RTL_LANGS.includes(lang)}
                          selected={active}
                          onSelect={() => toggleTemplate(v.id)}
                          selectLabel={tr(SELECT_LABEL, lang)}
                          selectedLabel={tr(SELECTED_LABEL, lang)}
                        >
                          <button
                            type="button"
                            aria-pressed={active}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                              active
                                ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
                                : 'border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            <span className="text-sm leading-none">{v.icon}</span>
                            {tr(v.label, lang)}
                          </button>
                        </StylePreviewCard>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>





          {/* Camera movement notes */}
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {t.cameraNotes} <span className="text-zinc-600">{t.optional}</span>
            </div>
            <Textarea
              value={cameraMovement}
              onChange={(e) => setCameraMovement(e.target.value)}
              rows={2}
              placeholder={t.cameraNotesPlaceholder}
              className="min-h-[56px] border-white/10 bg-black/30 text-zinc-100"
            />
          </div>

          {error ? <p className="text-xs leading-5 text-rose-300">{error}</p> : null}

          {/* Results */}
          {isSplit ? (
            <div className="space-y-3">
              {scenes.map((text, i) => (
                <div key={i} className="rounded-md border border-white/10 bg-black/30 p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      {t.scene_} {i + 1} ({sceneRange(i)})
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => copyText(text, i)}
                      disabled={isWriting || isSending}
                    >
                      {copiedIndex === i ? (
                        <Check className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                      )}
                      {copiedIndex === i ? t.copied : t.copy}
                    </Button>
                  </div>
                  <SceneText text={text} narrationLabel={t.narration} />
                </div>
              ))}
            </div>
          ) : scenes.length > 0 ? (
            <div className="rounded-md border border-white/10 bg-black/30 p-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {t.adScenario} ({duration}s)
              </div>
              <SceneText text={scenes[0]} narrationLabel={t.narration} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {scenes.length > 0 ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyText(concatenated, -1)}
                disabled={isWriting || isSending}
              >
                {copiedIndex === -1 ? (
                  <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                {copiedIndex === -1 ? t.copied : isSplit ? t.copyAll : t.copy}
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isWriting || isSending || businessSaving || !canGenerate}
                  >
                    {isWriting ? (
                      <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                    )}
                    {t.regenerate}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" dir={dir} className="w-52 border-white/10 bg-[#0b0c0e]/95 p-1">
                  <button
                    type="button"
                    onClick={() => generate(true)}
                    className="flex w-full items-center rounded-md px-2.5 py-2 text-sm text-zinc-100 transition hover:bg-white/10"
                  >
                    {t.withNarration}
                  </button>
                  <button
                    type="button"
                    onClick={() => generate(false)}
                    className="flex w-full items-center rounded-md px-2.5 py-2 text-sm text-zinc-100 transition hover:bg-white/10"
                  >
                    {t.withoutNarration}
                  </button>
                </PopoverContent>
              </Popover>
              {isSplit && onSendScenes ? (
                <Button size="sm" onClick={handleSendAll} disabled={isWriting || isSending || isPreparingFrame}>
                  {isSending || isPreparingFrame ? (
                    <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                  )}
                  {isPreparingFrame ? t.preparingFrame : t.sendAll}
                </Button>
              ) : (
                <Button size="sm" onClick={handleUseAsPrompt} disabled={isWriting || isSending || isPreparingFrame}>
                  {isPreparingFrame ? (
                    <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  ) : (
                    <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
                  )}
                  {isPreparingFrame ? t.preparingFrame : t.useAsPrompt}
                </Button>
              )}

            </>
          ) : (
            <Popover>
              <PopoverTrigger asChild>
                <Button disabled={isWriting || businessSaving || !canGenerate} size="sm">
                  {isWriting ? (
                    <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  ) : (
                    <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
                  )}
                  {t.generate}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" dir={dir} className="w-52 border-white/10 bg-[#0b0c0e]/95 p-1">
                <button
                  type="button"
                  onClick={() => generate(true)}
                  className="flex w-full items-center rounded-md px-2.5 py-2 text-sm text-zinc-100 transition hover:bg-white/10"
                >
                  {t.withNarration}
                </button>
                <button
                  type="button"
                  onClick={() => generate(false)}
                  className="flex w-full items-center rounded-md px-2.5 py-2 text-sm text-zinc-100 transition hover:bg-white/10"
                >
                  {t.withoutNarration}
                </button>
              </PopoverContent>
            </Popover>
          )}
        </div>

        <Dialog open={productPickerOpen} onOpenChange={(o) => { if (!preparingId) setProductPickerOpen(o) }}>
          <DialogContent dir={dir} className="max-w-2xl border-white/10 bg-[#0b0c0e]/95 text-zinc-100">
            <button
              type="button"
              onClick={openReframeHistory}
              title={t.reframeHistory}
              aria-label={t.reframeHistory}
              className="absolute right-12 top-4 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:border-amber-300/40 hover:text-amber-200"
            >
              <History className="h-4 w-4" aria-hidden="true" />
            </button>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Boxes className="h-4 w-4" aria-hidden="true" /> {t.chooseFromProducts}
              </DialogTitle>
              <DialogDescription className="text-zinc-400">{t.aspectHint}</DialogDescription>
            </DialogHeader>


            {/* Step 1: aspect ratio */}
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">{t.pickAspect}</div>
              <div role="radiogroup" className="inline-flex rounded-full border border-white/10 bg-black/20 p-1 text-xs font-semibold">
                {PRODUCT_ASPECTS.map((opt) => {
                  const active = pickedAspect === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setPickedAspect(opt.value)}
                      className={`rounded-full px-3 py-1.5 transition ${active ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      {opt.value}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Step 2: product grid */}
            <div className="mt-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">{t.pickProduct}</div>
              {loadingProducts ? (
                <div className="flex items-center justify-center py-10 text-sm text-zinc-400">
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> {t.loadingProducts}
                </div>
              ) : productPhotos.length === 0 ? (
                <div className="py-10 text-center text-sm text-zinc-500">{t.noProducts}</div>
              ) : (
                <div className="grid max-h-[50vh] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
                  {productPhotos.map((photo) => {
                    const busy = preparingId === photo.id
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        disabled={!pickedAspect || Boolean(preparingId)}
                        onClick={() => pickProduct(photo)}
                        className="group relative overflow-hidden rounded-md border border-white/10 bg-black/30 text-left transition hover:border-amber-300/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <img
                          src={photo.url}
                          alt={photo.title ?? 'Product'}
                          loading="lazy"
                          className="aspect-square w-full bg-black/40 object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                        />
                        <div className="truncate px-2 py-1 text-[11px] text-zinc-200">{photo.title || t.untitled}</div>
                        {busy ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 text-xs text-zinc-100">
                            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                            {t.preparing}
                          </div>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={() => { if (!preparingId) setProductPickerOpen(false) }} disabled={Boolean(preparingId)}>
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" /> {t.back}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={reframeHistoryOpen} onOpenChange={setReframeHistoryOpen}>
          <DialogContent dir={dir} className="max-w-2xl border-white/10 bg-[#0b0c0e]/95 text-zinc-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-4 w-4" aria-hidden="true" /> {t.reframeHistory}
              </DialogTitle>
              <DialogDescription className="text-zinc-400">{t.reuseHint}</DialogDescription>
            </DialogHeader>

            {loadingReframes ? (
              <div className="flex items-center justify-center py-10 text-sm text-zinc-400">
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> {t.loadingReframes}
              </div>
            ) : reframeItems.length === 0 ? (
              <div className="py-10 text-center text-sm text-zinc-500">{t.noReframes}</div>
            ) : (
              <div className="grid max-h-[55vh] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
                {reframeItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => reuseReframe(item)}
                    className="group relative overflow-hidden rounded-md border border-white/10 bg-black/30 text-left transition hover:border-amber-300/40"
                  >
                    <img
                      src={item.url}
                      alt={item.title ?? 'Reframed image'}
                      loading="lazy"
                      className="aspect-square w-full bg-black/40 object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                    />
                    <span className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                      {item.aspect}
                    </span>
                    <div className="truncate px-2 py-1 text-[11px] text-zinc-200">{item.title || t.untitled}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={() => setReframeHistoryOpen(false)}>
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" /> {t.back}
              </Button>
            </div>
          </DialogContent>
        </Dialog>



        <input
          ref={characterFileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleUploadCharacter(e.target.files?.[0])}
        />

        <Dialog open={characterPickerOpen} onOpenChange={(o) => { if (!uploadingCharacter) setCharacterPickerOpen(o) }}>
          <DialogContent dir={dir} className="max-w-2xl border-white/10 bg-[#0b0c0e]/95 text-zinc-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserRound className="h-4 w-4" aria-hidden="true" /> Choose a character
              </DialogTitle>
              <DialogDescription className="text-zinc-400">
                Pick a character you created with the Character Sheet, or upload one. The ad scenario will feature this character.
              </DialogDescription>
            </DialogHeader>

            <div>
              <button
                type="button"
                onClick={() => characterFileInputRef.current?.click()}
                disabled={uploadingCharacter}
                className="inline-flex items-center gap-2 rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:border-amber-300/60 hover:bg-amber-300/20 disabled:opacity-50"
              >
                {uploadingCharacter ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                )}
                Upload character
              </button>
            </div>

            <div className="mt-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Your characters</div>
              {loadingCharacters ? (
                <div className="flex items-center justify-center py-10 text-sm text-zinc-400">
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Loading characters…
                </div>
              ) : characterPhotos.length === 0 ? (
                <div className="py-10 text-center text-sm text-zinc-500">No characters yet. Create one with the Character Sheet, or upload an image above.</div>
              ) : (
                <div className="grid max-h-[50vh] grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
                  {characterPhotos.map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => pickCharacter(photo)}
                      className="group relative overflow-hidden rounded-md border border-white/10 bg-black/30 text-left transition hover:border-amber-300/40"
                    >
                      <img
                        src={photo.url}
                        alt={photo.title ?? 'Character'}
                        loading="lazy"
                        className="aspect-square w-full bg-black/40 object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                      />
                      <div className="truncate px-2 py-1 text-[11px] text-zinc-200">{photo.title || t.untitled}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={() => { if (!uploadingCharacter) setCharacterPickerOpen(false) }} disabled={uploadingCharacter}>
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" /> {t.back}
              </Button>
            </div>
          </DialogContent>
        </Dialog>


        <Dialog open={previewLightboxOpen && Boolean(imagePreviewUrl)} onOpenChange={setPreviewLightboxOpen}>
          <DialogContent dir={dir} className="max-w-3xl border-white/10 bg-[#0b0c0e]/95 text-zinc-100">
            <DialogHeader>
              <DialogTitle className="text-base">{t.viewImage}</DialogTitle>
            </DialogHeader>
            {imagePreviewUrl ? (
              <div className="flex max-h-[80vh] items-center justify-center">
                <img
                  src={imagePreviewUrl}
                  alt="Product preview"
                  className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
                />
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <AiImageDialog
          open={aiImageOpen}
          onOpenChange={setAiImageOpen}
          userId={userId}
          defaultAspect="1:1"
          onSaved={handleAiImageSaved}
        />
      </DialogContent>
    </Dialog>
  )
}
