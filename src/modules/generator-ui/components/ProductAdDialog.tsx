import { useEffect, useRef, useState } from 'react'
import { Package, LoaderCircle, RefreshCw, Copy, Check, Wand2, Send, ImagePlus, X, Languages, Boxes, ArrowLeft, Sparkles, Drama, UserRound } from 'lucide-react'
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
  onUseAsPrompt: (scenario: string, imageUrl?: string, duration?: ProductAdDuration) => void
  onSendScenes?: (scenes: string[], imageUrl?: string, duration?: ProductAdDuration) => void | Promise<void>
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

/** True when a title looks like a technical catalog code rather than a real product name. */
function looksLikeCode(title: string | null | undefined): boolean {
  if (!title) return false
  const t = title.trim()
  // code-like: lowercase tokens joined by _/- and/or ending in a number
  return /^[a-z0-9]+([_-][a-z0-9]+)+$/u.test(t) || /[_-]\d+\s*$/u.test(t)
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

type Lang = 'en' | 'fa' | 'ar' | 'tr' | 'es' | 'fr'

type Loc = Partial<Record<Lang, string>> & { en: string }
const tr = (m: Loc, lang: Lang) => m[lang] ?? m.en

const RTL_LANGS: Lang[] = ['fa', 'ar']

const LANG_OPTIONS: { value: Lang; native: string }[] = [
  { value: 'en', native: 'English' },
  { value: 'fa', native: 'فارسی' },
  { value: 'ar', native: 'العربية' },
  { value: 'tr', native: 'Türkçe' },
  { value: 'es', native: 'Español' },
  { value: 'fr', native: 'Français' },
]

const CAMERA_STYLES: { label: Loc; icon: string; desc?: Loc; preview?: string }[] = [
  { label: { en: 'Whip Pan', fa: 'پن سریع', ar: 'بان سريع', tr: 'Hızlı Kaydırma', es: 'Barrido Rápido', fr: 'Filé Rapide' }, icon: '💫', preview: camWhipPan.url },
  { label: { en: 'Orbit Shot', fa: 'نمای مداری', ar: 'لقطة مدارية', tr: 'Yörünge Çekimi', es: 'Toma Orbital', fr: 'Plan Orbital' }, icon: '🛰️', preview: camOrbit.url },
  { label: { en: 'FPV Drone', fa: 'پهپاد FPV', ar: 'درون FPV', tr: 'FPV Drone', es: 'Dron FPV', fr: 'Drone FPV' }, icon: '🚁', preview: camFpvDrone.url },
  { label: { en: 'Tracking Shot', fa: 'نمای تعقیبی', ar: 'لقطة تتبع', tr: 'Takip Çekimi', es: 'Toma de Seguimiento', fr: 'Plan de Suivi' }, icon: '🎯', preview: camTracking.url },
  { label: { en: 'Push In Cinematic', fa: 'پوش‌این سینمایی', ar: 'دفع سينمائي', tr: 'Sinematik Yaklaşma', es: 'Acercamiento Cinematográfico', fr: 'Travelling Avant Cinématique' }, icon: '🎬', preview: camPushIn.url },
  { label: { en: 'Fly Through', fa: 'عبور پروازی', ar: 'تحليق عبر', tr: 'İçinden Uçuş', es: 'Vuelo a Través', fr: 'Survol Traversant' }, icon: '🕊️', preview: camFlyThrough.url },
  { label: { en: 'Crash Zoom', fa: 'زوم ضربه‌ای', ar: 'تكبير مفاجئ', tr: 'Ani Zoom', es: 'Zoom Brusco', fr: 'Zoom Brutal' }, icon: '💥', preview: camCrashZoom.url },
  { label: { en: 'Handheld Dynamic', fa: 'دوربین‌روی‌دست پویا', ar: 'كاميرا محمولة ديناميكية', tr: 'Dinamik Elde Çekim', es: 'Cámara en Mano Dinámica', fr: "Caméra à l'Épaule Dynamique" }, icon: '🤳', preview: camHandheld.url },
  { label: { en: 'Dolly Zoom', fa: 'دالی زوم', ar: 'دوللي زوم', tr: 'Dolly Zoom', es: 'Dolly Zoom', fr: 'Travelling Compensé' }, icon: '🌀', preview: camDollyZoom.url },
  { label: { en: 'Parallax Motion', fa: 'حرکت پارالاکس', ar: 'حركة بارالاكس', tr: 'Paralaks Hareketi', es: 'Movimiento Parallax', fr: 'Mouvement Parallaxe' }, icon: '🧊', preview: camParallax.url },
]

type GenreTemplate = { id: string; label: Loc; icon: string; prompt: string; preview?: string }

const GENRE_TEMPLATES: GenreTemplate[] = [
  {
    id: 'epic-fantasy',
    label: { en: 'Epic Fantasy', fa: 'فانتزی حماسی', ar: 'فانتازيا ملحمية', tr: 'Epik Fantezi', es: 'Fantasía Épica', fr: 'Fantaisie Épique' },
    icon: '🐉',
    prompt:
      'Epic fantasy directing: sweeping wide vistas of dreamlike landscapes, castles and mythical creatures, magical glowing lighting and an awe-inspiring heroic mood.',
    preview: genreEpicFantasy.url,
  },
  {
    id: 'sci-fi-minimalist',
    label: { en: 'Sci-Fi Minimalist', fa: 'علمی‌تخیلی مینیمال', ar: 'خيال علمي بسيط', tr: 'Minimalist Bilim Kurgu', es: 'Ciencia Ficción Minimalista', fr: 'Science-Fiction Minimaliste' },
    icon: '🛸',
    prompt:
      'Minimalist sci-fi directing: clean white spaces, straight lines, hidden seamless technology and a calm, sleek futuristic atmosphere.',
    preview: genreScifiMinimal.url,
  },
  {
    id: 'post-apocalyptic',
    label: { en: 'Post-Apocalyptic', fa: 'پساآخرالزمانی', ar: 'ما بعد الكارثة', tr: 'Kıyamet Sonrası', es: 'Post-Apocalíptico', fr: 'Post-Apocalyptique' },
    icon: '☢️',
    prompt:
      'Post-apocalyptic directing: ruined cities, nature overgrowing buildings, ash, dust and a desolate abandoned atmosphere with muted desaturated tones.',
    preview: genrePostApocalyptic.url,
  },
  {
    id: 'horror-jump-scare',
    label: { en: 'Horror Jump-Scare', fa: 'وحشت ناگهانی', ar: 'رعب مفاجئ', tr: 'Ani Korku', es: 'Terror de Susto', fr: 'Horreur à Sursaut' },
    icon: '👻',
    prompt:
      'Sudden-horror directing: deep darkness, harsh localized light (like a flashlight), tense silence and abrupt movement changes that create dread and fear.',
    preview: genreHorror.url,
  },
  {
    id: 'high-octane-action',
    label: { en: 'High-Octane Action', fa: 'اکشن پرتحرک', ar: 'أكشن عالي الإثارة', tr: 'Yüksek Tempolu Aksiyon', es: 'Acción Trepidante', fr: 'Action à Haute Tension' },
    icon: '🔥',
    prompt:
      'High-octane action directing: rapid cuts, camera shake, explosions, high speed and motion blur for an intense adrenaline-fueled feel.',
    preview: genreAction.url,
  },
  {
    id: 'romantic-dreamscape',
    label: { en: 'Romantic Dreamscape', fa: 'رؤیای رمانتیک', ar: 'حلم رومانسي', tr: 'Romantik Rüya', es: 'Ensueño Romántico', fr: 'Rêverie Romantique' },
    icon: '💗',
    prompt:
      'Romantic dreamscape directing: soft golden-hour sunlight, gentle soft focus on the subjects and warm dreamy colors for an intimate emotional mood.',
    preview: genreRomantic.url,
  },
  {
    id: 'documentary-realism',
    label: { en: 'Documentary / Realism', fa: 'مستند/واقع‌گرا', ar: 'وثائقي / واقعي', tr: 'Belgesel / Gerçekçilik', es: 'Documental / Realismo', fr: 'Documentaire / Réalisme' },
    icon: '🎥',
    prompt:
      'Documentary realism directing: natural light, no stylized grading, true-to-life colors and simple unobtrusive camera movements for an authentic real feel.',
    preview: genreDocumentary.url,
  },
  {
    id: 'anime-manga',
    label: { en: 'Anime / Manga Style', fa: 'سبک انیمه/مانگا', ar: 'نمط أنمي / مانغا', tr: 'Anime / Manga Tarzı', es: 'Estilo Anime / Manga', fr: 'Style Anime / Manga' },
    icon: '🌸',
    prompt:
      'Anime/manga style directing: bold outline lines, saturated flat 2D colors and exaggerated dynamic motion effects with expressive energetic action.',
    preview: genreAnime.url,
  },
]

type SceneTemplate = { id: string; label: Loc; icon: string; group: Loc; prompt: string; preview?: string }

const G_INDUSTRIAL: Loc = { en: 'Industrial & Construction', fa: 'صنعتی و ساخت‌وساز', ar: 'صناعي وإنشاءات', tr: 'Endüstriyel ve İnşaat', es: 'Industrial y Construcción', fr: 'Industriel et Construction' }
const G_URBAN: Loc = { en: 'Urban & Modern', fa: 'شهری و مدرن', ar: 'حضري وحديث', tr: 'Kentsel ve Modern', es: 'Urbano y Moderno', fr: 'Urbain et Moderne' }
const G_NATURE: Loc = { en: 'Natural & Epic Landscapes', fa: 'مناظر طبیعی و حماسی', ar: 'مناظر طبيعية ملحمية', tr: 'Doğal ve Epik Manzaralar', es: 'Paisajes Naturales y Épicos', fr: 'Paysages Naturels et Épiques' }
const G_HISTORICAL: Loc = { en: 'Historical & Fantasy', fa: 'تاریخی و فانتزی', ar: 'تاريخي وخيالي', tr: 'Tarihi ve Fantastik', es: 'Histórico y Fantasía', fr: 'Historique et Fantastique' }
const G_INTERIOR: Loc = { en: 'Interior & Moody', fa: 'فضای داخلی و حسی', ar: 'داخلي وأجواء', tr: 'İç Mekan ve Atmosferik', es: 'Interior y Atmosférico', fr: 'Intérieur et Atmosphérique' }

const SCENE_TEMPLATES: SceneTemplate[] = [
  // Industrial & Construction
  { id: 'construction-site', label: { en: 'Construction Site', fa: 'کارگاه ساختمانی', ar: 'موقع بناء', tr: 'İnşaat Sahası', es: 'Obra de Construcción', fr: 'Chantier de Construction' }, icon: '🏗️', group: G_INDUSTRIAL, prompt: 'Construction site environment: steel building skeletons, giant moving cranes, dust and dirt, hard-hat workers at sunset.', preview: scConstructionSite.url },
  { id: 'heavy-industry', label: { en: 'Heavy Industry Factory', fa: 'کارخانه صنایع سنگین', ar: 'مصنع صناعات ثقيلة', tr: 'Ağır Sanayi Fabrikası', es: 'Fábrica de Industria Pesada', fr: "Usine d'Industrie Lourde" }, icon: '🏭', group: G_INDUSTRIAL, prompt: 'Heavy industry factory environment: molten iron, welding sparks, large gear machinery and huge smokestacks.', preview: scHeavyIndustry.url },
  { id: 'abandoned-warehouse', label: { en: 'Abandoned Warehouse', fa: 'انبار متروکه', ar: 'مستودع مهجور', tr: 'Terk Edilmiş Depo', es: 'Almacén Abandonado', fr: 'Entrepôt Abandonné' }, icon: '🕸️', group: G_INDUSTRIAL, prompt: 'Abandoned warehouse environment: large empty space, broken windows, light beams piercing from the roof and dust floating in the air.', preview: scAbandonedWarehouse.url },
  { id: 'shipyard-dock', label: { en: 'Shipyard / Dock', fa: 'کشتی‌سازی و اسکله', ar: 'حوض سفن / رصيف', tr: 'Tersane / İskele', es: 'Astillero / Muelle', fr: 'Chantier Naval / Quai' }, icon: '🚢', group: G_INDUSTRIAL, prompt: 'Shipyard and dock environment: giant container ships, coastal cranes, seawater and rusty steel structures.', preview: scShipyardDock.url },
  { id: 'high-tech-lab', label: { en: 'High-Tech Laboratory', fa: 'آزمایشگاه پیشرفته', ar: 'مختبر عالي التقنية', tr: 'Yüksek Teknoloji Laboratuvarı', es: 'Laboratorio de Alta Tecnología', fr: 'Laboratoire High-Tech' }, icon: '🔬', group: G_INDUSTRIAL, prompt: 'High-tech laboratory environment: clean white walls, blinking computer server racks, glass chambers and cold blue or laser lighting.', preview: scHighTechLab.url },
  // Urban & Modern
  { id: 'megacity-corporate', label: { en: 'Megacity Corporate', fa: 'کلان‌شهر اداری', ar: 'مدينة شركات عملاقة', tr: 'Megakent Kurumsal', es: 'Megaciudad Corporativa', fr: "Mégapole d'Affaires" }, icon: '🏙️', group: G_URBAN, prompt: 'Megacity corporate environment: giant glass skyscrapers, clouds reflecting on the glass and a sleek upscale business atmosphere.', preview: scMegacityCorporate.url },
  { id: 'cyberpunk-alleyway', label: { en: 'Cyberpunk Alleyway', fa: 'کوچه سایبرپانک', ar: 'زقاق سايبربانك', tr: 'Siberpunk Ara Sokak', es: 'Callejón Cyberpunk', fr: 'Ruelle Cyberpunk' }, icon: '🌃', group: G_URBAN, prompt: 'Cyberpunk alleyway environment: crowded narrow streets at night, multilingual neon signs, hanging wires and street-food kiosks.', preview: scCyberpunkAlleyway.url },
  { id: 'subway-station', label: { en: 'Subway / Underground Station', fa: 'ایستگاه مترو', ar: 'محطة مترو', tr: 'Metro İstasyonu', es: 'Estación de Metro', fr: 'Station de Métro' }, icon: '🚇', group: G_URBAN, prompt: 'Subway station environment: dark tunnels, fast moving trains with motion blur and concrete platforms under fluorescent light.', preview: scSubwayStation.url },
  { id: 'rooftop-overlook', label: { en: 'Rooftop Overlook', fa: 'منظره از پشت‌بام', ar: 'إطلالة من السطح', tr: 'Çatı Manzarası', es: 'Mirador en la Azotea', fr: 'Vue depuis le Toit' }, icon: '🌆', group: G_URBAN, prompt: 'Rooftop overlook environment: the edge of a tall tower rooftop at night while the whole city lights glow in the background with cinematic bokeh.', preview: scRooftopOverlook.url },
  // Natural & Epic Landscapes
  { id: 'epic-mountain', label: { en: 'Epic Mountain Range', fa: 'رشته‌کوه حماسی', ar: 'سلسلة جبال ملحمية', tr: 'Epik Dağ Silsilesi', es: 'Cordillera Épica', fr: 'Chaîne de Montagnes Épique' }, icon: '🏔️', group: G_NATURE, prompt: 'Epic mountain range environment: sharp snowy peaks, thick fog in the valleys and steep cliffs.', preview: scEpicMountain.url },
  { id: 'apocalyptic-wasteland', label: { en: 'Post-Apocalyptic Wasteland', fa: 'بیابان پساآخرالزمانی', ar: 'أرض قاحلة ما بعد الكارثة', tr: 'Kıyamet Sonrası Çorak Toprak', es: 'Páramo Post-Apocalíptico', fr: 'Terre Désolée Post-Apocalyptique' }, icon: '🏜️', group: G_NATURE, prompt: 'Post-apocalyptic wasteland environment: endless sand plains, abandoned worn vehicles, dusty sky and a scorching sun.', preview: scApocalypticWasteland.url },
  { id: 'mystical-forest', label: { en: 'Deep Mystical Forest', fa: 'جنگل اسرارآمیز', ar: 'غابة غامضة عميقة', tr: 'Derin Gizemli Orman', es: 'Bosque Místico Profundo', fr: 'Forêt Mystique Profonde' }, icon: '🌲', group: G_NATURE, prompt: 'Deep mystical forest environment: ancient tall trees, dense foliage, light filtered through leaves reaching the ground and a misty atmosphere.', preview: scMysticalForest.url },
  { id: 'arctic-tundra', label: { en: 'Arctic Tundra / Ice Landscape', fa: 'تاندرای قطبی و یخی', ar: 'تندرا قطبية / منظر جليدي', tr: 'Arktik Tundra / Buz Manzarası', es: 'Tundra Ártica / Paisaje Helado', fr: 'Toundra Arctique / Paysage Glacé' }, icon: '❄️', group: G_NATURE, prompt: 'Arctic tundra ice landscape environment: endless white plains, ice caves with blue light reflections and a snowstorm.', preview: scArcticTundra.url },
  // Historical & Fantasy
  { id: 'medieval-castle', label: { en: 'Medieval Castle / Citadel', fa: 'قلعه قرون‌وسطایی', ar: 'قلعة من العصور الوسطى', tr: 'Ortaçağ Kalesi', es: 'Castillo Medieval', fr: 'Château Médiéval' }, icon: '🏰', group: G_HISTORICAL, prompt: 'Medieval castle environment: large stone walls, lit torches on the walls and dark halls with long wooden tables.', preview: scMedievalCastle.url },
  { id: 'ancient-ruins', label: { en: 'Ancient Ruins', fa: 'ویرانه‌های باستانی', ar: 'أطلال قديمة', tr: 'Antik Harabeler', es: 'Ruinas Antiguas', fr: 'Ruines Antiques' }, icon: '🏛️', group: G_HISTORICAL, prompt: 'Ancient ruins environment: cracked Greek or Egyptian stone columns covered in vines, set in a desert or forest.', preview: scAncientRuins.url },
  { id: 'gothic-cathedral', label: { en: 'Gothic Cathedral', fa: 'کلیسای گوتیک', ar: 'كاتدرائية قوطية', tr: 'Gotik Katedral', es: 'Catedral Gótica', fr: 'Cathédrale Gothique' }, icon: '⛪', group: G_HISTORICAL, prompt: 'Gothic cathedral environment: pointed architecture and large stained-glass windows casting colorful light into a vast dark hall.', preview: scGothicCathedral.url },
  { id: 'steampunk-workshop', label: { en: 'Steampunk Workshop', fa: 'کارگاه استیم‌پانک', ar: 'ورشة ستيمبانك', tr: 'Steampunk Atölyesi', es: 'Taller Steampunk', fr: 'Atelier Steampunk' }, icon: '⚙️', group: G_HISTORICAL, prompt: 'Steampunk workshop environment: copper pipes, gauge dials, steam and intricate 19th-century mechanical tools.', preview: scSteampunkWorkshop.url },
  // Interior & Moody
  { id: 'jazz-club', label: { en: 'Dimly Lit Jazz Club', fa: 'کلوب جاز کم‌نور', ar: 'نادي جاز خافت الإضاءة', tr: 'Loş Caz Kulübü', es: 'Club de Jazz Tenue', fr: 'Club de Jazz Tamisé' }, icon: '🎷', group: G_INTERIOR, prompt: 'Dimly lit jazz club environment: a cozy space, cigarette smoke hanging in spot lighting, shiny brass instruments and dark leather furniture.', preview: scJazzClub.url },
  { id: 'dark-academia-library', label: { en: 'Dark Academia Library', fa: 'کتابخانه کلاسیک', ar: 'مكتبة أكاديمية داكنة', tr: 'Dark Academia Kütüphanesi', es: 'Biblioteca Dark Academia', fr: 'Bibliothèque Dark Academia' }, icon: '📚', group: G_INTERIOR, prompt: 'Dark academia library environment: tall wooden shelves full of old leather books, study desks with green lamps and the scent of old paper.', preview: scDarkAcademiaLibrary.url },
  { id: 'retro-diner', label: { en: 'Retro Diner', fa: 'رستوران رترو', ar: 'مطعم ريترو', tr: 'Retro Lokanta', es: 'Restaurante Retro', fr: 'Diner Rétro' }, icon: '🍔', group: G_INTERIOR, prompt: 'Retro 80s diner environment: red leather booths, neon interior decor, a jukebox and rain-streaked windows at night.', preview: scRetroDiner.url },
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

const VG_SPORTS: Loc = { en: 'Sports & Action', fa: 'ورزشی و پرتحرک', ar: 'رياضة وأكشن', tr: 'Spor ve Aksiyon', es: 'Deportes y Acción', fr: 'Sport et Action' }
const VG_ANIMATION: Loc = { en: 'Animation & Motion Graphics', fa: 'انیمیشن و موشن گرافیک', ar: 'رسوم متحركة وموشن جرافيك', tr: 'Animasyon ve Hareketli Grafik', es: 'Animación y Motion Graphics', fr: 'Animation et Motion Design' }
const VG_SOCIAL: Loc = { en: 'Social Media', fa: 'شبکه‌های اجتماعی و تولید محتوا', ar: 'وسائل التواصل الاجتماعي', tr: 'Sosyal Medya', es: 'Redes Sociales', fr: 'Réseaux Sociaux' }
const VG_CORPORATE: Loc = { en: 'Corporate & Business', fa: 'شرکتی و کسب‌وکار', ar: 'شركات وأعمال', tr: 'Kurumsal ve İş', es: 'Corporativo y Negocios', fr: 'Entreprise et Business' }
const VG_CINEMATIC: Loc = { en: 'Cinematic & Creative', fa: 'سینمایی و خلاقانه', ar: 'سينمائي وإبداعي', tr: 'Sinematik ve Yaratıcı', es: 'Cinematográfico y Creativo', fr: 'Cinématique et Créatif' }
const VG_EVENTS: Loc = { en: 'Events & Occasions', fa: 'رویدادها و مناسبت‌ها', ar: 'فعاليات ومناسبات', tr: 'Etkinlikler ve Özel Günler', es: 'Eventos y Ocasiones', fr: 'Événements et Occasions' }
const VG_EXPLAINER: Loc = { en: 'Explainer & Educational', fa: 'توضیح‌دهنده و آموزشی', ar: 'توضيحي وتعليمي', tr: 'Açıklayıcı ve Eğitici', es: 'Explicativo y Educativo', fr: 'Explicatif et Éducatif' }

const VIDEO_TEMPLATES: VideoTemplate[] = [
  // 1. Sports & Action
  { id: 'football-team', label: { en: 'Football / Team Sports', fa: 'فوتبال و ورزش‌های تیمی', ar: 'كرة القدم / رياضات جماعية', tr: 'Futbol / Takım Sporları', es: 'Fútbol / Deportes de Equipo', fr: "Football / Sports d'Équipe" }, icon: '⚽', group: VG_SPORTS, prompt: 'Sports broadcast template: team line-up reveals, player profile cards, animated live-score lower thirds and refereeing graphics with energetic stadium atmosphere.', preview: vtFootballTeam.url },
  { id: 'sports-highlights', label: { en: 'Sports Highlights', fa: 'هایلایت‌های ورزشی', ar: 'أبرز اللقطات الرياضية', tr: 'Spor Özetleri', es: 'Resúmenes Deportivos', fr: 'Résumés Sportifs' }, icon: '🏆', group: VG_SPORTS, prompt: 'Sports highlights template: fast transitions, high-energy effects and jump cuts to showcase goals and decisive match moments.', preview: vtSportsHighlights.url },
  { id: 'fitness', label: { en: 'Fitness & Bodybuilding', fa: 'فیتنس و بدنسازی', ar: 'لياقة وكمال أجسام', tr: 'Fitness ve Vücut Geliştirme', es: 'Fitness y Culturismo', fr: 'Fitness et Musculation' }, icon: '💪', group: VG_SPORTS, prompt: 'Fitness template: motivational footage cut to a fast music tempo, promoting gyms or training programs with dynamic energy.', preview: vtFitness.url },
  { id: 'gaming-esports', label: { en: 'Gaming / Esports', fa: 'گیمینگ و ورزش‌های الکترونیک', ar: 'ألعاب / رياضات إلكترونية', tr: 'Oyun / E-spor', es: 'Gaming / Esports', fr: 'Jeux Vidéo / Esport' }, icon: '🎮', group: VG_SPORTS, prompt: 'Gaming and esports template: stream channel intros, on-screen overlays and team reveals with neon glowing effects.', preview: vtGamingEsports.url },
  // 2. Animation & Motion Graphics
  { id: 'explainer', label: { en: 'Explainer Video', fa: 'ویدئوی آموزشی/توضیحی', ar: 'فيديو توضيحي', tr: 'Açıklayıcı Video', es: 'Vídeo Explicativo', fr: 'Vidéo Explicative' }, icon: '🧩', group: VG_ANIMATION, prompt: '2D/3D explainer template: animated characters explaining a system, product or service with clean motion graphics.', preview: vtExplainer.url },
  { id: 'logo-reveal', label: { en: 'Logo Reveal', fa: 'لوگو موشن', ar: 'ظهور الشعار', tr: 'Logo Tanıtımı', es: 'Revelación de Logo', fr: 'Révélation de Logo' }, icon: '✨', group: VG_ANIMATION, prompt: 'Logo reveal template: short, eye-catching few-second animation introducing a brand logo at the start of videos.', preview: vtLogoReveal.url },
  { id: 'kinetic-typography', label: { en: 'Kinetic Typography', fa: 'تایپوگرافی متحرک', ar: 'تايبوغرافي حركي', tr: 'Kinetik Tipografi', es: 'Tipografía Cinética', fr: 'Typographie Cinétique' }, icon: '🔤', group: VG_ANIMATION, prompt: 'Kinetic typography template: built entirely on creative, rhythmic animated text synced to the beat.', preview: vtKineticTypography.url },
  { id: 'motion-comic', label: { en: 'Motion Comics', fa: 'موشن کمیک', ar: 'كوميكس متحرك', tr: 'Hareketli Çizgi Roman', es: 'Cómics en Movimiento', fr: 'Bande Dessinée Animée' }, icon: '💥', group: VG_ANIMATION, prompt: 'Motion comic template: animated comic-book panels and visual storytelling with painterly comic effects.', preview: vtMotionComic.url },
  // 3. Social Media
  { id: 'youtube-intro-outro', label: { en: 'YouTube Intro & Outro', fa: 'اینترو و اوترو یوتیوب', ar: 'مقدمة وخاتمة يوتيوب', tr: 'YouTube Intro ve Outro', es: 'Intro y Outro de YouTube', fr: 'Intro et Outro YouTube' }, icon: '▶️', group: VG_SOCIAL, prompt: 'YouTube intro/outro template: opening sequences and end screens with animated like and subscribe button prompts.', preview: vtYoutubeIntroOutro.url },
  { id: 'instagram-reels', label: { en: 'Instagram Story / Reels', fa: 'استوری و ریلز اینستاگرام', ar: 'ستوري / ريلز إنستغرام', tr: 'Instagram Hikaye / Reels', es: 'Historia / Reels de Instagram', fr: 'Story / Reels Instagram' }, icon: '📱', group: VG_SOCIAL, prompt: 'Vertical 9:16 template: minimal, e-commerce or lifestyle designs for quick product showcases in stories and reels.', preview: vtInstagramReels.url },
  { id: 'tiktok-trends', label: { en: 'TikTok & Trends', fa: 'تیک‌تاک و ترندها', ar: 'تيك توك والترندات', tr: 'TikTok ve Trendler', es: 'TikTok y Tendencias', fr: 'TikTok et Tendances' }, icon: '🎵', group: VG_SOCIAL, prompt: 'TikTok trend template: beat-synced edits and viral transitions matched to the music.', preview: vtTiktokTrends.url },
  { id: 'vodcast', label: { en: 'Video Podcast (Vodcast)', fa: 'پادکست ویدئویی', ar: 'بودكاست فيديو', tr: 'Video Podcast', es: 'Vídeo Podcast', fr: 'Podcast Vidéo' }, icon: '🎙️', group: VG_SOCIAL, prompt: 'Video podcast template: audio spectrum visualizer and timer overlays for publishing podcasts.', preview: vtVodcast.url },
  // 4. Corporate & Business
  { id: 'company-profile', label: { en: 'Company Profile', fa: 'معرفی شرکت', ar: 'ملف الشركة', tr: 'Şirket Tanıtımı', es: 'Perfil de Empresa', fr: "Présentation d'Entreprise" }, icon: '🏢', group: VG_CORPORATE, prompt: 'Company profile template: history and goals timeline, leadership team introductions and business vision presentation.', preview: vtCompanyProfile.url },
  { id: 'infographic', label: { en: 'Presentation / Infographic', fa: 'ارائه‌ها و اینفوگرافیک', ar: 'عرض تقديمي / إنفوجرافيك', tr: 'Sunum / İnfografik', es: 'Presentación / Infografía', fr: 'Présentation / Infographie' }, icon: '📊', group: VG_CORPORATE, prompt: 'Infographic template: animated charts, city or country maps and attractive visual presentation of statistical data.', preview: vtInfographic.url },
  { id: 'real-estate', label: { en: 'Real Estate', fa: 'املاک و مستغلات', ar: 'عقارات', tr: 'Emlak', es: 'Bienes Raíces', fr: 'Immobilier' }, icon: '🏠', group: VG_CORPORATE, prompt: 'Real estate template: clean professional slideshows with text info to present home details and architecture projects.', preview: vtRealEstate.url },
  { id: 'product-promo', label: { en: 'Product Promo', fa: 'تبلیغات محصول', ar: 'ترويج منتج', tr: 'Ürün Tanıtımı', es: 'Promoción de Producto', fr: 'Promotion de Produit' }, icon: '🛍️', group: VG_CORPORATE, prompt: 'Product promo template: 3D or video showcase of features, price and multiple angles of a new product.', preview: vtProductPromo.url },
  // 5. Cinematic & Creative
  { id: 'movie-trailer', label: { en: 'Movie Trailer / Teaser', fa: 'تریلر فیلم و تیزر', ar: 'إعلان فيلم / تشويقي', tr: 'Film Fragmanı', es: 'Tráiler de Película', fr: 'Bande-Annonce de Film' }, icon: '🎬', group: VG_CINEMATIC, prompt: 'Cinematic trailer template: epic dramatic titles, light effects and dark atmospheric mood.', preview: vtMovieTrailer.url },
  { id: 'photo-slideshow', label: { en: 'Photo / Video Slideshow', fa: 'اسلایدشوی عکس و ویدئو', ar: 'عرض شرائح صور / فيديو', tr: 'Foto / Video Slayt Gösterisi', es: 'Presentación de Fotos / Vídeo', fr: 'Diaporama Photo / Vidéo' }, icon: '🖼️', group: VG_CINEMATIC, prompt: 'Slideshow template: artistic blend of images with soft music, suited for portfolios or travel memories.', preview: vtPhotoSlideshow.url },
  { id: 'glitch-retro', label: { en: 'Glitch & Retro', fa: 'افکت‌های گلیچ و رترو', ar: 'غليتش وريترو', tr: 'Glitch ve Retro', es: 'Glitch y Retro', fr: 'Glitch et Rétro' }, icon: '📼', group: VG_CINEMATIC, prompt: 'Glitch and retro template: VHS tape simulation, old TV noise and 80s/90s visual styling.', preview: vtGlitchRetro.url },
  { id: 'vfx', label: { en: 'VFX / Special Effects', fa: 'جلوه‌های ویژه', ar: 'مؤثرات بصرية', tr: 'VFX / Özel Efektler', es: 'VFX / Efectos Especiales', fr: 'VFX / Effets Spéciaux' }, icon: '🌩️', group: VG_CINEMATIC, prompt: 'VFX template: ready-made explosions, magic, smoke, fire and weather changes layered over raw footage.', preview: vtVfx.url },
  // 6. Events & Occasions
  { id: 'wedding', label: { en: 'Wedding & Formal', fa: 'عروسی و فرمالیته', ar: 'زفاف ورسمي', tr: 'Düğün ve Resmi', es: 'Boda y Formal', fr: 'Mariage et Cérémonie' }, icon: '💍', group: VG_EVENTS, prompt: 'Wedding template: romantic slideshows with warm color grading, floral frames, delicate typography and soft light leaks.', preview: vtWedding.url },
  { id: 'birthday-party', label: { en: 'Birthday & Party', fa: 'تولد و مهمانی', ar: 'عيد ميلاد وحفلة', tr: 'Doğum Günü ve Parti', es: 'Cumpleaños y Fiesta', fr: 'Anniversaire et Fête' }, icon: '🎉', group: VG_EVENTS, prompt: 'Birthday and party template: colorful, joyful video invitations with balloon and confetti animations.', preview: vtBirthdayParty.url },
  { id: 'calendar-campaigns', label: { en: 'Holidays & Campaigns', fa: 'مناسبت‌های تقویمی و کمپین‌ها', ar: 'أعياد وحملات', tr: 'Tatiller ve Kampanyalar', es: 'Festividades y Campañas', fr: 'Fêtes et Campagnes' }, icon: '🎄', group: VG_EVENTS, prompt: 'Seasonal campaign template: tailored for Christmas, Halloween, Nowruz, Ramadan, Black Friday and seasonal discount sales.', preview: vtCalendarCampaigns.url },
  // 7. Explainer & Educational
  { id: 'whiteboard', label: { en: 'Whiteboard Animation', fa: 'انیمیشن وایت‌برد', ar: 'رسوم السبورة البيضاء', tr: 'Beyaz Tahta Animasyonu', es: 'Animación de Pizarra Blanca', fr: 'Animation Tableau Blanc' }, icon: '✍️', group: VG_EXPLAINER, prompt: 'Whiteboard animation template: a visible hand drawing simple sketches and text on a white board, building the explanation step by step with marker strokes.', preview: vtWhiteboard.url },
  { id: 'blackboard', label: { en: 'Blackboard Animation', fa: 'انیمیشن بلک‌برد', ar: 'رسوم السبورة السوداء', tr: 'Kara Tahta Animasyonu', es: 'Animación de Pizarra Negra', fr: 'Animation Tableau Noir' }, icon: '🟢', group: VG_EXPLAINER, prompt: 'Blackboard animation template: chalk-style white and colored drawings appearing on a dark blackboard, nostalgic classroom feel with hand-drawn diagrams.', preview: vtBlackboard.url },
  { id: 'glassboard', label: { en: 'Glassboard Animation', fa: 'انیمیشن گلس‌برد', ar: 'رسوم اللوح الزجاجي', tr: 'Cam Tahta Animasyonu', es: 'Animación de Pizarra de Vidrio', fr: 'Animation Tableau de Verre' }, icon: '🟩', group: VG_EXPLAINER, prompt: 'Glassboard animation template: a real presenter behind a transparent glass writing with glowing neon markers, mirrored so the text reads correctly, dark studio background.', preview: vtGlassboard.url },
  { id: 'line-art', label: { en: 'Line Art Animation', fa: 'انیمیشن خطی', ar: 'رسوم خطية', tr: 'Çizgi Sanatı Animasyonu', es: 'Animación de Arte Lineal', fr: 'Animation Line Art' }, icon: '〰️', group: VG_EXPLAINER, prompt: 'Line art animation template: continuous single-line illustrations with no fill, lines flowing smoothly and morphing from one shape into the next.', preview: vtLineArt.url },
  { id: 'infographic-motion', label: { en: 'Infographic Animation', fa: 'موشن گرافیک اینفوگرافیک', ar: 'رسوم إنفوجرافيك متحركة', tr: 'İnfografik Animasyon', es: 'Animación de Infografía', fr: 'Animation Infographique' }, icon: '📊', group: VG_EXPLAINER, prompt: 'Infographic animation template: animated charts, graphs, percentages and data visualizations that bring statistics to life for easy digestion.', preview: vtInfographicMotion.url },
  { id: 'flat-2d', label: { en: '2D Flat Animation', fa: 'انیمیشن تخت دوبعدی', ar: 'رسوم مسطحة ثنائية الأبعاد', tr: '2D Düz Animasyon', es: 'Animación 2D Plana', fr: 'Animation 2D Plate' }, icon: '🟦', group: VG_EXPLAINER, prompt: '2D flat animation template: solid flat colors, no complex shadows and simple clean characters, ideal for startup explainer videos.', preview: vtFlat2d.url },
  { id: 'isometric', label: { en: 'Isometric Animation', fa: 'انیمیشن ایزومتریک', ar: 'رسوم متساوية القياس', tr: 'İzometrik Animasyon', es: 'Animación Isométrica', fr: 'Animation Isométrique' }, icon: '📐', group: VG_EXPLAINER, prompt: 'Isometric animation template: 2D illustrations drawn at a 30-degree angle to convey depth, great for showing cities, system architecture and technology.', preview: vtIsometric.url },
  { id: 'character-2d', label: { en: '2D Character Animation', fa: 'انیمیشن کاراکترمحور دوبعدی', ar: 'رسوم شخصيات ثنائية الأبعاد', tr: '2D Karakter Animasyonu', es: 'Animación de Personajes 2D', fr: 'Animation de Personnage 2D' }, icon: '🧍', group: VG_EXPLAINER, prompt: '2D character animation template: a central character facing a problem, then the product or idea introduced as the solution, narrative-driven storytelling.', preview: vtCharacter2d.url },
  { id: 'cut-out', label: { en: 'Cut-out Animation', fa: 'انیمیشن کات‌اوت', ar: 'رسوم القص واللصق', tr: 'Kesme Kağıt Animasyonu', es: 'Animación de Recortes', fr: 'Animation Découpée' }, icon: '✂️', group: VG_EXPLAINER, prompt: 'Cut-out animation template: characters and environments built from cut paper or cardboard pieces, giving a playful handmade crafty feel.', preview: vtCutOut.url },
  { id: 'stop-motion', label: { en: 'Stop Motion', fa: 'استاپ موشن', ar: 'إيقاف الحركة', tr: 'Stop Motion', es: 'Stop Motion', fr: 'Stop Motion' }, icon: '🧩', group: VG_EXPLAINER, prompt: 'Stop motion template: frame-by-frame photography of real objects like clay, Lego or everyday items, played fast to create the illusion of movement.', preview: vtStopMotion.url },
  { id: 'screencast-ui', label: { en: 'Screencast / UI Animation', fa: 'اسکرین‌کست و انیمیشن رابط کاربری', ar: 'تسجيل شاشة / رسوم واجهة', tr: 'Ekran Kaydı / Arayüz Animasyonu', es: 'Screencast / Animación de UI', fr: "Capture d'Écran / Animation UI" }, icon: '🖥️', group: VG_EXPLAINER, prompt: 'Screencast / UI animation template: an app or website interface shown with smooth animated buttons, menus and zoom highlights instead of a plain screen recording.', preview: vtScreencastUi.url },
  { id: 'live-action-tracked', label: { en: 'Live-Action + Tracked Graphics', fa: 'لایو اکشن با گرافیک شناور', ar: 'لقطات حية مع عناصر متتبعة', tr: 'Canlı Çekim + Takipli Grafikler', es: 'Acción Real + Gráficos Rastreados', fr: 'Prises Réelles + Éléments Suivis' }, icon: '🎞️', group: VG_EXPLAINER, prompt: 'Live-action with tracked elements template: real footage of people or environments with 3D floating graphics, numbers and text tracked into the scene.', preview: vtLiveActionTracked.url },
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
    copy: 'Copy',
    copyAll: 'Copy all',
    copied: 'Copied',
    regenerate: 'Regenerate',
    sendAll: 'Send all to Pending',
    useAsPrompt: 'Use as prompt',
    preparingFrame: 'Preparing frame…',
    generate: 'Generate ad scenario',
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
  },
  fa: {
    title: 'سناریوی تبلیغ محصول',
    description:
      'عکس و نام محصول را اضافه کنید، به چند سؤال پاسخ دهید و یک سناریوی تبلیغاتی سینمایی متناسب با سبک دوربین انتخابی‌تان دریافت کنید.',
    photo: 'عکس',
    productName: 'نام محصول',
    productNamePlaceholder: 'مثلاً سرم آوراگلو',
    descriptionLabel: 'توضیحات',
    optional: '(اختیاری)',
    descriptionPlaceholder: 'ویژگی‌های کلیدی، حال‌وهوا، مخاطب هدف…',
    yourPrompt: 'پرامت شما',
    yourPromptPlaceholder:
      'پرامت یا ایده‌ی خودتان را بنویسید — برای مدت‌زمان و سبک دوربین انتخابی بازنویسی می‌شود…',
    duration: 'مدت‌زمان',
    cameraStyle: 'سبک دوربین',
    genre: 'ژانر و حال‌وهوا',
    scene: 'صحنه و محیط',
    videoTemplates: 'تمپلیت‌های ویدئویی',
    cameraNotes: 'یادداشت‌های حرکت دوربین',
    cameraNotesPlaceholder:
      'توضیح دهید دوربین چطور حرکت کند، مثلاً بالا آمدن آرام سپس پوش‌این سریع روی برچسب…',
    adScenario: 'سناریوی تبلیغ',
    scene_: 'صحنه',
    copy: 'کپی',
    copyAll: 'کپی همه',
    copied: 'کپی شد',
    regenerate: 'تولید دوباره',
    sendAll: 'ارسال همه به Pending',
    useAsPrompt: 'استفاده به‌عنوان پرامت',
    preparingFrame: 'در حال آماده‌سازی فریم…',
    generate: 'تولید سناریوی تبلیغ',
    language: 'زبان',
    chooseFromProducts: 'انتخاب از محصولات',
    generateWithAi: 'ساخت با هوش مصنوعی',
    pickAspect: 'انتخاب ابعاد تصویر',
    pickProduct: 'یک محصول را انتخاب کنید',
    aspectHint: 'ابتدا ابعاد را انتخاب کنید، سپس محصول را برگزینید.',
    noProducts: 'هنوز عکس محصولی ذخیره نشده است.',
    untitled: 'بدون نام',
    preparing: 'در حال آماده‌سازی تصویر…',
    loadingProducts: 'در حال بارگذاری محصولات…',
    back: 'بازگشت',
    viewImage: 'نمایش تصویر',
  },
  ar: {
    title: 'سيناريو إعلان المنتج',
    description:
      'أضف صورة واسم منتجك، أجب عن بعض الأسئلة، واحصل على سيناريو إعلاني سينمائي متوافق مع أسلوب الكاميرا الذي تختاره.',
    photo: 'صورة',
    productName: 'اسم المنتج',
    productNamePlaceholder: 'مثال: سيروم أوراغلو',
    descriptionLabel: 'الوصف',
    optional: '(اختياري)',
    descriptionPlaceholder: 'الميزات الرئيسية، الأجواء، الجمهور المستهدف…',
    yourPrompt: 'موجّهك',
    yourPromptPlaceholder:
      'اكتب موجّهك أو فكرتك — ستتم إعادة صياغتها حسب المدة وأسلوب الكاميرا المختار…',
    duration: 'المدة',
    cameraStyle: 'أسلوب الكاميرا',
    genre: 'النوع والأجواء',
    scene: 'المشهد والبيئة',
    videoTemplates: 'قوالب الفيديو',
    cameraNotes: 'ملاحظات حركة الكاميرا',
    cameraNotesPlaceholder:
      'صف كيف ينبغي أن تتحرك الكاميرا، مثلاً ارتفاع بطيء ثم دفع سريع نحو الملصق…',
    adScenario: 'سيناريو الإعلان',
    scene_: 'مشهد',
    copy: 'نسخ',
    copyAll: 'نسخ الكل',
    copied: 'تم النسخ',
    regenerate: 'إعادة التوليد',
    sendAll: 'إرسال الكل إلى قائمة الانتظار',
    useAsPrompt: 'استخدام كموجّه',
    preparingFrame: 'جارٍ تجهيز الإطار…',
    generate: 'توليد سيناريو الإعلان',
    language: 'اللغة',
    chooseFromProducts: 'اختر من المنتجات',
    generateWithAi: 'إنشاء بالذكاء الاصطناعي',
    pickAspect: 'اختر أبعاد الصورة',
    pickProduct: 'اختر منتجًا',
    aspectHint: 'اختر الأبعاد أولاً ثم اختر المنتج.',
    noProducts: 'لا توجد صور منتجات محفوظة بعد.',
    untitled: 'بدون اسم',
    preparing: 'جارٍ تحضير الصورة…',
    loadingProducts: 'جارٍ تحميل المنتجات…',
    back: 'رجوع',
    viewImage: 'عرض الصورة',
  },
  tr: {
    title: 'Ürün Reklam Senaryosu',
    description:
      'Ürün fotoğrafınızı ve adını ekleyin, birkaç soruyu yanıtlayın ve seçtiğiniz kamera stiline uygun sinematik bir reklam senaryosu alın.',
    photo: 'Fotoğraf',
    productName: 'Ürün adı',
    productNamePlaceholder: 'örn. AuraGlow Serum',
    descriptionLabel: 'Açıklama',
    optional: '(isteğe bağlı)',
    descriptionPlaceholder: 'Temel özellikler, atmosfer, hedef kitle…',
    yourPrompt: 'İsteminiz',
    yourPromptPlaceholder:
      'Kendi isteminizi / fikrinizi yazın — seçtiğiniz süre ve kamera stiline göre yeniden yazılacaktır…',
    duration: 'Süre',
    cameraStyle: 'Kamera stili',
    genre: 'Tür ve atmosfer',
    scene: 'Sahne ve ortam',
    videoTemplates: 'Video şablonları',
    cameraNotes: 'Kamera hareketi notları',
    cameraNotesPlaceholder:
      'Kameranın nasıl hareket etmesi gerektiğini açıklayın, örn. yavaş yükseliş ardından etikete hızlı yaklaşma…',
    adScenario: 'Reklam senaryosu',
    scene_: 'Sahne',
    copy: 'Kopyala',
    copyAll: 'Tümünü kopyala',
    copied: 'Kopyalandı',
    regenerate: 'Yeniden oluştur',
    sendAll: 'Tümünü Bekleyenlere gönder',
    useAsPrompt: 'İstem olarak kullan',
    preparingFrame: 'Kare hazırlanıyor…',
    generate: 'Reklam senaryosu oluştur',
    language: 'Dil',
    chooseFromProducts: 'Ürünlerden seç',
    generateWithAi: 'Yapay zeka ile oluştur',
    pickAspect: 'Görüntü boyutlarını seç',
    pickProduct: 'Bir ürün seç',
    aspectHint: 'Önce boyutları, sonra ürünü seçin.',
    noProducts: 'Henüz kayıtlı ürün fotoğrafı yok.',
    untitled: 'Adsız',
    preparing: 'Görüntü hazırlanıyor…',
    loadingProducts: 'Ürünler yükleniyor…',
    back: 'Geri',
    viewImage: 'Görseli görüntüle',
  },
  es: {
    title: 'Guion de Anuncio de Producto',
    description:
      'Añade la foto y el nombre de tu producto, responde unas preguntas y obtén un guion publicitario cinematográfico ajustado al estilo de cámara que elijas.',
    photo: 'Foto',
    productName: 'Nombre del producto',
    productNamePlaceholder: 'p. ej. Sérum AuraGlow',
    descriptionLabel: 'Descripción',
    optional: '(opcional)',
    descriptionPlaceholder: 'Características clave, ambiente, público objetivo…',
    yourPrompt: 'Tu prompt',
    yourPromptPlaceholder:
      'Escribe tu propio prompt / idea — se reescribirá según la duración y el estilo de cámara seleccionados…',
    duration: 'Duración',
    cameraStyle: 'Estilo de cámara',
    genre: 'Género y atmósfera',
    scene: 'Escena y entorno',
    videoTemplates: 'Plantillas de vídeo',
    cameraNotes: 'Notas de movimiento de cámara',
    cameraNotesPlaceholder:
      'Describe cómo debe moverse la cámara, p. ej. subida lenta y luego acercamiento rápido a la etiqueta…',
    adScenario: 'Guion del anuncio',
    scene_: 'Escena',
    copy: 'Copiar',
    copyAll: 'Copiar todo',
    copied: 'Copiado',
    regenerate: 'Regenerar',
    sendAll: 'Enviar todo a Pendientes',
    useAsPrompt: 'Usar como prompt',
    preparingFrame: 'Preparando fotograma…',
    generate: 'Generar guion del anuncio',
    language: 'Idioma',
    chooseFromProducts: 'Elegir de productos',
    generateWithAi: 'Generar con IA',
    pickAspect: 'Elige las dimensiones de la imagen',
    pickProduct: 'Elige un producto',
    aspectHint: 'Elige primero las dimensiones y luego el producto.',
    noProducts: 'Aún no hay fotos de productos guardadas.',
    untitled: 'Sin título',
    preparing: 'Preparando imagen…',
    loadingProducts: 'Cargando productos…',
    back: 'Atrás',
    viewImage: 'Ver imagen',
  },
  fr: {
    title: 'Scénario de Publicité Produit',
    description:
      'Ajoutez la photo et le nom de votre produit, répondez à quelques questions et obtenez un scénario publicitaire cinématographique adapté au style de caméra choisi.',
    photo: 'Photo',
    productName: 'Nom du produit',
    productNamePlaceholder: 'p. ex. Sérum AuraGlow',
    descriptionLabel: 'Description',
    optional: '(optionnel)',
    descriptionPlaceholder: 'Caractéristiques clés, ambiance, public cible…',
    yourPrompt: 'Votre prompt',
    yourPromptPlaceholder:
      'Écrivez votre propre prompt / idée — il sera réécrit selon la durée et le style de caméra sélectionnés…',
    duration: 'Durée',
    cameraStyle: 'Style de caméra',
    genre: 'Genre et atmosphère',
    scene: 'Scène et environnement',
    videoTemplates: 'Modèles vidéo',
    cameraNotes: 'Notes de mouvement de caméra',
    cameraNotesPlaceholder:
      "Décrivez comment la caméra doit bouger, p. ex. montée lente puis travelling avant rapide sur l'étiquette…",
    adScenario: 'Scénario publicitaire',
    scene_: 'Scène',
    copy: 'Copier',
    copyAll: 'Tout copier',
    copied: 'Copié',
    regenerate: 'Régénérer',
    sendAll: 'Tout envoyer en attente',
    useAsPrompt: 'Utiliser comme prompt',
    preparingFrame: 'Préparation de l’image…',
    generate: 'Générer le scénario publicitaire',
    language: 'Langue',
    chooseFromProducts: 'Choisir parmi les produits',
    generateWithAi: 'Générer avec l\'IA',
    pickAspect: 'Choisissez les dimensions de l’image',
    pickProduct: 'Choisissez un produit',
    aspectHint: 'Choisissez d’abord les dimensions, puis le produit.',
    noProducts: 'Aucune photo de produit enregistrée.',
    untitled: 'Sans titre',
    preparing: 'Préparation de l’image…',
    loadingProducts: 'Chargement des produits…',
    back: 'Retour',
    viewImage: "Voir l'image",
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
  fa: {
    title: 'شناسنامه کاراکتر',
    description:
      'تصویر کاراکتر خود را آپلود کنید، به چند سؤال پاسخ دهید و یک سناریوی سینمایی کامل که کاملاً حول همان کاراکتر ساخته شده دریافت کنید.',
    photo: 'کاراکتر',
    productName: 'نام کاراکتر',
    productNamePlaceholder: 'مثلاً کاپیتان آریا',
    descriptionPlaceholder: 'شخصیت، نقش، سن، حال‌وهوا، پیشینه…',
    generate: 'ساخت سناریوی فیلم',
  },
  ar: {
    title: 'بطاقة الشخصية',
    description:
      'حمّل صورة شخصيتك، أجب عن بعض الأسئلة، واحصل على سيناريو فيلم سينمائي مبني بالكامل حول تلك الشخصية.',
    photo: 'الشخصية',
    productName: 'اسم الشخصية',
    productNamePlaceholder: 'مثال: الكابتن آريا',
    descriptionPlaceholder: 'الشخصية، الدور، العمر، الأجواء، الخلفية…',
    generate: 'إنشاء سيناريو الفيلم',
  },
  tr: {
    title: 'Karakter Sayfası',
    description:
      'Karakter görselinizi yükleyin, birkaç soruyu yanıtlayın ve tamamen o karakter etrafında kurgulanmış sinematik bir film senaryosu alın.',
    photo: 'Karakter',
    productName: 'Karakter adı',
    productNamePlaceholder: 'örn. Kaptan Aria',
    descriptionPlaceholder: 'Kişilik, rol, yaş, atmosfer, geçmiş…',
    generate: 'Film senaryosu oluştur',
  },
  es: {
    title: 'Ficha de Personaje',
    description:
      'Sube la imagen de tu personaje, responde unas preguntas y obtén un guion de película cinematográfico construido por completo en torno a ese personaje.',
    photo: 'Personaje',
    productName: 'Nombre del personaje',
    productNamePlaceholder: 'p. ej. Capitana Aria',
    descriptionPlaceholder: 'Personalidad, rol, edad, ambiente, historia…',
    generate: 'Generar guion de película',
  },
  fr: {
    title: 'Fiche de Personnage',
    description:
      'Téléchargez l’image de votre personnage, répondez à quelques questions et obtenez un scénario de film cinématographique entièrement construit autour de ce personnage.',
    photo: 'Personnage',
    productName: 'Nom du personnage',
    productNamePlaceholder: 'p. ex. Capitaine Aria',
    descriptionPlaceholder: 'Personnalité, rôle, âge, ambiance, histoire…',
    generate: 'Générer le scénario du film',
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
      if (!productName.trim() && photo.title) setProductName(cleanProductName(photo.title))
      setNameNeedsReview(looksLikeCode(photo.title))
      setProductPickerOpen(false)
    } catch (e) {
      setPreviewLoading(false)
      setError((e as Error).message ?? 'Failed to prepare image')
    } finally {
      setPreparingId(null)
    }
  }



  useEffect(() => {
    if (open) {
      setDuration(defaultDuration)
      setError(null)
    }
  }, [open, defaultDuration])

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

  function handleAiImageSaved(row: AiImageSavedRow) {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setError(null)
    setImagePreviewUrl(row.storage_path)
    setUploadedImageUrl(row.storage_path)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function generate() {
    if (isWriting) return
    if (isCharacter) {
      if (!uploadedImageUrl) {
        setError('Please upload a character image first.')
        return
      }
    } else if (!userPrompt.trim() && !productName.trim() && !uploadedImageUrl) {
      setError('Write a prompt, add a product name, or attach a product photo.')
      return
    }
    setIsWriting(true)
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


  async function handleUseAsPrompt() {
    if (scenes.length === 0 || isPreparingFrame) return
    setIsPreparingFrame(true)
    setError(null)
    try {
      const frameUrl = await buildFirstFrame()
      onUseAsPrompt(scenes.join('\n\n'), frameUrl, duration)
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
      await onSendScenes(scenes, frameUrl, duration)
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
  const canGenerate = isCharacter
    ? Boolean(uploadedImageUrl) && !isUploadingImage
    : (userPrompt.trim().length > 0 || productName.trim().length > 0 || Boolean(uploadedImageUrl)) && !isUploadingImage
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
            <div className="ms-auto">
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
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder={t.productNamePlaceholder}
                  className="border-white/10 bg-black/30 text-zinc-100"
                />
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
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setCameraStyle(style.label.en)}
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
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setGenre((cur) => (cur === g.id ? '' : g.id))}
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
                        >
                          <button
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setScene((cur) => (cur === s.id ? '' : s.id))}
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
                        >
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleTemplate(v.id)}
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
                  <p dir="ltr" className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          ) : scenes.length > 0 ? (
            <div className="rounded-md border border-white/10 bg-black/30 p-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {t.adScenario} ({duration}s)
              </div>
              <p dir="ltr" className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">
                {scenes[0]}
              </p>
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
              <Button
                variant="ghost"
                size="sm"
                onClick={generate}
                disabled={isWriting || isSending || !canGenerate}
              >
                {isWriting ? (
                  <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                {t.regenerate}
              </Button>
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
            <Button onClick={generate} disabled={isWriting || !canGenerate} size="sm">
              {isWriting ? (
                <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
              )}
              {t.generate}
            </Button>
          )}
        </div>

        <Dialog open={productPickerOpen} onOpenChange={(o) => { if (!preparingId) setProductPickerOpen(o) }}>
          <DialogContent dir={dir} className="max-w-2xl border-white/10 bg-[#0b0c0e]/95 text-zinc-100">
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
