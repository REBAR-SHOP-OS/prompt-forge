import { useEffect, useRef, useState } from 'react'
import { Package, LoaderCircle, RefreshCw, Copy, Check, Wand2, Send, ImagePlus, X, Languages } from 'lucide-react'
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
import { supabase } from '@/integrations/supabase/client'

export type ProductAdDuration = 5 | 10 | 15 | 30 | 45 | 135

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDuration: ProductAdDuration
  userId: string | null
  onUseAsPrompt: (scenario: string, imageUrl?: string) => void
  onSendScenes?: (scenes: string[], imageUrl?: string) => void | Promise<void>
}

const DURATIONS: ProductAdDuration[] = [5, 10, 15, 30, 45, 135]
const FRAMES_BUCKET = 'wan-frames'

const SPLIT_DURATIONS = [30, 45, 135]
const sceneRange = (i: number) => `${i * 15}–${(i + 1) * 15}s`

const CAMERA_STYLES: { label: string; icon: string }[] = [
  { label: 'Whip Pan', icon: '💫' },
  { label: 'Orbit Shot', icon: '🛰️' },
  { label: 'FPV Drone', icon: '🚁' },
  { label: 'Tracking Shot', icon: '🎯' },
  { label: 'Push In Cinematic', icon: '🎬' },
  { label: 'Fly Through', icon: '🕊️' },
  { label: 'Crash Zoom', icon: '💥' },
  { label: 'Handheld Dynamic', icon: '🤳' },
  { label: 'Dolly Zoom', icon: '🌀' },
  { label: 'Parallax Motion', icon: '🧊' },
]

type GenreTemplate = { id: string; label: string; icon: string; prompt: string }

const GENRE_TEMPLATES: GenreTemplate[] = [
  {
    id: 'epic-fantasy',
    label: 'Epic Fantasy',
    icon: '🐉',
    prompt:
      'Epic fantasy directing: sweeping wide vistas of dreamlike landscapes, castles and mythical creatures, magical glowing lighting and an awe-inspiring heroic mood.',
  },
  {
    id: 'sci-fi-minimalist',
    label: 'Sci-Fi Minimalist',
    icon: '🛸',
    prompt:
      'Minimalist sci-fi directing: clean white spaces, straight lines, hidden seamless technology and a calm, sleek futuristic atmosphere.',
  },
  {
    id: 'post-apocalyptic',
    label: 'Post-Apocalyptic',
    icon: '☢️',
    prompt:
      'Post-apocalyptic directing: ruined cities, nature overgrowing buildings, ash, dust and a desolate abandoned atmosphere with muted desaturated tones.',
  },
  {
    id: 'horror-jump-scare',
    label: 'Horror Jump-Scare',
    icon: '👻',
    prompt:
      'Sudden-horror directing: deep darkness, harsh localized light (like a flashlight), tense silence and abrupt movement changes that create dread and fear.',
  },
  {
    id: 'high-octane-action',
    label: 'High-Octane Action',
    icon: '🔥',
    prompt:
      'High-octane action directing: rapid cuts, camera shake, explosions, high speed and motion blur for an intense adrenaline-fueled feel.',
  },
  {
    id: 'romantic-dreamscape',
    label: 'Romantic Dreamscape',
    icon: '💗',
    prompt:
      'Romantic dreamscape directing: soft golden-hour sunlight, gentle soft focus on the subjects and warm dreamy colors for an intimate emotional mood.',
  },
  {
    id: 'documentary-realism',
    label: 'Documentary / Realism',
    icon: '🎥',
    prompt:
      'Documentary realism directing: natural light, no stylized grading, true-to-life colors and simple unobtrusive camera movements for an authentic real feel.',
  },
  {
    id: 'anime-manga',
    label: 'Anime / Manga Style',
    icon: '🌸',
    prompt:
      'Anime/manga style directing: bold outline lines, saturated flat 2D colors and exaggerated dynamic motion effects with expressive energetic action.',
  },
]

type SceneTemplate = { id: string; label: string; icon: string; group: string; prompt: string }

const SCENE_TEMPLATES: SceneTemplate[] = [
  // Industrial & Construction
  { id: 'construction-site', label: 'Construction Site', icon: '🏗️', group: 'Industrial & Construction', prompt: 'Construction site environment: steel building skeletons, giant moving cranes, dust and dirt, hard-hat workers at sunset.' },
  { id: 'heavy-industry', label: 'Heavy Industry Factory', icon: '🏭', group: 'Industrial & Construction', prompt: 'Heavy industry factory environment: molten iron, welding sparks, large gear machinery and huge smokestacks.' },
  { id: 'abandoned-warehouse', label: 'Abandoned Warehouse', icon: '🕸️', group: 'Industrial & Construction', prompt: 'Abandoned warehouse environment: large empty space, broken windows, light beams piercing from the roof and dust floating in the air.' },
  { id: 'shipyard-dock', label: 'Shipyard / Dock', icon: '🚢', group: 'Industrial & Construction', prompt: 'Shipyard and dock environment: giant container ships, coastal cranes, seawater and rusty steel structures.' },
  { id: 'high-tech-lab', label: 'High-Tech Laboratory', icon: '🔬', group: 'Industrial & Construction', prompt: 'High-tech laboratory environment: clean white walls, blinking computer server racks, glass chambers and cold blue or laser lighting.' },
  // Urban & Modern
  { id: 'megacity-corporate', label: 'Megacity Corporate', icon: '🏙️', group: 'Urban & Modern', prompt: 'Megacity corporate environment: giant glass skyscrapers, clouds reflecting on the glass and a sleek upscale business atmosphere.' },
  { id: 'cyberpunk-alleyway', label: 'Cyberpunk Alleyway', icon: '🌃', group: 'Urban & Modern', prompt: 'Cyberpunk alleyway environment: crowded narrow streets at night, multilingual neon signs, hanging wires and street-food kiosks.' },
  { id: 'subway-station', label: 'Subway / Underground Station', icon: '🚇', group: 'Urban & Modern', prompt: 'Subway station environment: dark tunnels, fast moving trains with motion blur and concrete platforms under fluorescent light.' },
  { id: 'rooftop-overlook', label: 'Rooftop Overlook', icon: '🌆', group: 'Urban & Modern', prompt: 'Rooftop overlook environment: the edge of a tall tower rooftop at night while the whole city lights glow in the background with cinematic bokeh.' },
  // Natural & Epic Landscapes
  { id: 'epic-mountain', label: 'Epic Mountain Range', icon: '🏔️', group: 'Natural & Epic Landscapes', prompt: 'Epic mountain range environment: sharp snowy peaks, thick fog in the valleys and steep cliffs.' },
  { id: 'apocalyptic-wasteland', label: 'Post-Apocalyptic Wasteland', icon: '🏜️', group: 'Natural & Epic Landscapes', prompt: 'Post-apocalyptic wasteland environment: endless sand plains, abandoned worn vehicles, dusty sky and a scorching sun.' },
  { id: 'mystical-forest', label: 'Deep Mystical Forest', icon: '🌲', group: 'Natural & Epic Landscapes', prompt: 'Deep mystical forest environment: ancient tall trees, dense foliage, light filtered through leaves reaching the ground and a misty atmosphere.' },
  { id: 'arctic-tundra', label: 'Arctic Tundra / Ice Landscape', icon: '❄️', group: 'Natural & Epic Landscapes', prompt: 'Arctic tundra ice landscape environment: endless white plains, ice caves with blue light reflections and a snowstorm.' },
  // Historical & Fantasy
  { id: 'medieval-castle', label: 'Medieval Castle / Citadel', icon: '🏰', group: 'Historical & Fantasy', prompt: 'Medieval castle environment: large stone walls, lit torches on the walls and dark halls with long wooden tables.' },
  { id: 'ancient-ruins', label: 'Ancient Ruins', icon: '🏛️', group: 'Historical & Fantasy', prompt: 'Ancient ruins environment: cracked Greek or Egyptian stone columns covered in vines, set in a desert or forest.' },
  { id: 'gothic-cathedral', label: 'Gothic Cathedral', icon: '⛪', group: 'Historical & Fantasy', prompt: 'Gothic cathedral environment: pointed architecture and large stained-glass windows casting colorful light into a vast dark hall.' },
  { id: 'steampunk-workshop', label: 'Steampunk Workshop', icon: '⚙️', group: 'Historical & Fantasy', prompt: 'Steampunk workshop environment: copper pipes, gauge dials, steam and intricate 19th-century mechanical tools.' },
  // Interior & Moody
  { id: 'jazz-club', label: 'Dimly Lit Jazz Club', icon: '🎷', group: 'Interior & Moody', prompt: 'Dimly lit jazz club environment: a cozy space, cigarette smoke hanging in spot lighting, shiny brass instruments and dark leather furniture.' },
  { id: 'dark-academia-library', label: 'Dark Academia Library', icon: '📚', group: 'Interior & Moody', prompt: 'Dark academia library environment: tall wooden shelves full of old leather books, study desks with green lamps and the scent of old paper.' },
  { id: 'retro-diner', label: 'Retro Diner', icon: '🍔', group: 'Interior & Moody', prompt: 'Retro 80s diner environment: red leather booths, neon interior decor, a jukebox and rain-streaked windows at night.' },
]

const SCENE_GROUPS = Array.from(new Set(SCENE_TEMPLATES.map((s) => s.group)))

type VideoTemplate = {
  id: string
  label: string
  labelFa: string
  icon: string
  group: string
  groupFa: string
  prompt: string
}

const VIDEO_TEMPLATES: VideoTemplate[] = [
  // 1. Sports & Action
  { id: 'football-team', label: 'Football / Team Sports', labelFa: 'فوتبال و ورزش‌های تیمی', icon: '⚽', group: 'Sports & Action', groupFa: 'ورزشی و پرتحرک', prompt: 'Sports broadcast template: team line-up reveals, player profile cards, animated live-score lower thirds and refereeing graphics with energetic stadium atmosphere.' },
  { id: 'sports-highlights', label: 'Sports Highlights', labelFa: 'هایلایت‌های ورزشی', icon: '🏆', group: 'Sports & Action', groupFa: 'ورزشی و پرتحرک', prompt: 'Sports highlights template: fast transitions, high-energy effects and jump cuts to showcase goals and decisive match moments.' },
  { id: 'fitness', label: 'Fitness & Bodybuilding', labelFa: 'فیتنس و بدنسازی', icon: '💪', group: 'Sports & Action', groupFa: 'ورزشی و پرتحرک', prompt: 'Fitness template: motivational footage cut to a fast music tempo, promoting gyms or training programs with dynamic energy.' },
  { id: 'gaming-esports', label: 'Gaming / Esports', labelFa: 'گیمینگ و ورزش‌های الکترونیک', icon: '🎮', group: 'Sports & Action', groupFa: 'ورزشی و پرتحرک', prompt: 'Gaming and esports template: stream channel intros, on-screen overlays and team reveals with neon glowing effects.' },
  // 2. Animation & Motion Graphics
  { id: 'explainer', label: 'Explainer Video', labelFa: 'ویدئوی آموزشی/توضیحی', icon: '🧩', group: 'Animation & Motion Graphics', groupFa: 'انیمیشن و موشن گرافیک', prompt: '2D/3D explainer template: animated characters explaining a system, product or service with clean motion graphics.' },
  { id: 'logo-reveal', label: 'Logo Reveal', labelFa: 'لوگو موشن', icon: '✨', group: 'Animation & Motion Graphics', groupFa: 'انیمیشن و موشن گرافیک', prompt: 'Logo reveal template: short, eye-catching few-second animation introducing a brand logo at the start of videos.' },
  { id: 'kinetic-typography', label: 'Kinetic Typography', labelFa: 'تایپوگرافی متحرک', icon: '🔤', group: 'Animation & Motion Graphics', groupFa: 'انیمیشن و موشن گرافیک', prompt: 'Kinetic typography template: built entirely on creative, rhythmic animated text synced to the beat.' },
  { id: 'motion-comic', label: 'Motion Comics', labelFa: 'موشن کمیک', icon: '💥', group: 'Animation & Motion Graphics', groupFa: 'انیمیشن و موشن گرافیک', prompt: 'Motion comic template: animated comic-book panels and visual storytelling with painterly comic effects.' },
  // 3. Social Media
  { id: 'youtube-intro-outro', label: 'YouTube Intro & Outro', labelFa: 'اینترو و اوترو یوتیوب', icon: '▶️', group: 'Social Media', groupFa: 'شبکه‌های اجتماعی و تولید محتوا', prompt: 'YouTube intro/outro template: opening sequences and end screens with animated like and subscribe button prompts.' },
  { id: 'instagram-reels', label: 'Instagram Story / Reels', labelFa: 'استوری و ریلز اینستاگرام', icon: '📱', group: 'Social Media', groupFa: 'شبکه‌های اجتماعی و تولید محتوا', prompt: 'Vertical 9:16 template: minimal, e-commerce or lifestyle designs for quick product showcases in stories and reels.' },
  { id: 'tiktok-trends', label: 'TikTok & Trends', labelFa: 'تیک‌تاک و ترندها', icon: '🎵', group: 'Social Media', groupFa: 'شبکه‌های اجتماعی و تولید محتوا', prompt: 'TikTok trend template: beat-synced edits and viral transitions matched to the music.' },
  { id: 'vodcast', label: 'Video Podcast (Vodcast)', labelFa: 'پادکست ویدئویی', icon: '🎙️', group: 'Social Media', groupFa: 'شبکه‌های اجتماعی و تولید محتوا', prompt: 'Video podcast template: audio spectrum visualizer and timer overlays for publishing podcasts.' },
  // 4. Corporate & Business
  { id: 'company-profile', label: 'Company Profile', labelFa: 'معرفی شرکت', icon: '🏢', group: 'Corporate & Business', groupFa: 'شرکتی و کسب‌وکار', prompt: 'Company profile template: history and goals timeline, leadership team introductions and business vision presentation.' },
  { id: 'infographic', label: 'Presentation / Infographic', labelFa: 'ارائه‌ها و اینفوگرافیک', icon: '📊', group: 'Corporate & Business', groupFa: 'شرکتی و کسب‌وکار', prompt: 'Infographic template: animated charts, city or country maps and attractive visual presentation of statistical data.' },
  { id: 'real-estate', label: 'Real Estate', labelFa: 'املاک و مستغلات', icon: '🏠', group: 'Corporate & Business', groupFa: 'شرکتی و کسب‌وکار', prompt: 'Real estate template: clean professional slideshows with text info to present home details and architecture projects.' },
  { id: 'product-promo', label: 'Product Promo', labelFa: 'تبلیغات محصول', icon: '🛍️', group: 'Corporate & Business', groupFa: 'شرکتی و کسب‌وکار', prompt: 'Product promo template: 3D or video showcase of features, price and multiple angles of a new product.' },
  // 5. Cinematic & Creative
  { id: 'movie-trailer', label: 'Movie Trailer / Teaser', labelFa: 'تریلر فیلم و تیزر', icon: '🎬', group: 'Cinematic & Creative', groupFa: 'سینمایی و خلاقانه', prompt: 'Cinematic trailer template: epic dramatic titles, light effects and dark atmospheric mood.' },
  { id: 'photo-slideshow', label: 'Photo / Video Slideshow', labelFa: 'اسلایدشوی عکس و ویدئو', icon: '🖼️', group: 'Cinematic & Creative', groupFa: 'سینمایی و خلاقانه', prompt: 'Slideshow template: artistic blend of images with soft music, suited for portfolios or travel memories.' },
  { id: 'glitch-retro', label: 'Glitch & Retro', labelFa: 'افکت‌های گلیچ و رترو', icon: '📼', group: 'Cinematic & Creative', groupFa: 'سینمایی و خلاقانه', prompt: 'Glitch and retro template: VHS tape simulation, old TV noise and 80s/90s visual styling.' },
  { id: 'vfx', label: 'VFX / Special Effects', labelFa: 'جلوه‌های ویژه', icon: '🌩️', group: 'Cinematic & Creative', groupFa: 'سینمایی و خلاقانه', prompt: 'VFX template: ready-made explosions, magic, smoke, fire and weather changes layered over raw footage.' },
  // 6. Events & Occasions
  { id: 'wedding', label: 'Wedding & Formal', labelFa: 'عروسی و فرمالیته', icon: '💍', group: 'Events & Occasions', groupFa: 'رویدادها و مناسبت‌ها', prompt: 'Wedding template: romantic slideshows with warm color grading, floral frames, delicate typography and soft light leaks.' },
  { id: 'birthday-party', label: 'Birthday & Party', labelFa: 'تولد و مهمانی', icon: '🎉', group: 'Events & Occasions', groupFa: 'رویدادها و مناسبت‌ها', prompt: 'Birthday and party template: colorful, joyful video invitations with balloon and confetti animations.' },
  { id: 'calendar-campaigns', label: 'Holidays & Campaigns', labelFa: 'مناسبت‌های تقویمی و کمپین‌ها', icon: '🎄', group: 'Events & Occasions', groupFa: 'رویدادها و مناسبت‌ها', prompt: 'Seasonal campaign template: tailored for Christmas, Halloween, Nowruz, Ramadan, Black Friday and seasonal discount sales.' },
]

const VIDEO_GROUPS = Array.from(new Set(VIDEO_TEMPLATES.map((v) => v.group)))
const VIDEO_GROUP_FA: Record<string, string> = Object.fromEntries(
  VIDEO_TEMPLATES.map((v) => [v.group, v.groupFa]),
)

type Lang = 'en' | 'fa'

const T = {
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
    generate: 'Generate ad scenario',
    translate: 'نمایش به فارسی',
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
    generate: 'تولید سناریوی تبلیغ',
    translate: 'Show in English',
  },
} as const

export default function ProductAdDialog({
  open,
  onOpenChange,
  defaultDuration,
  userId,
  onUseAsPrompt,
  onSendScenes,
}: Props) {
  const [duration, setDuration] = useState<ProductAdDuration>(defaultDuration)
  const [productName, setProductName] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [userPrompt, setUserPrompt] = useState('')
  const [cameraStyle, setCameraStyle] = useState<string>(CAMERA_STYLES[0].label)
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
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function generate() {
    if (isWriting) return
    if (!userPrompt.trim() && !productName.trim() && !uploadedImageUrl) {
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
      let idea = trimmedPrompt
        ? trimmedName
          ? `${trimmedPrompt}\n\nThis is an advertisement for the product "${trimmedName}".`
          : trimmedPrompt
        : trimmedName
          ? `Advertisement for the product "${trimmedName}".`
          : 'Advertisement for the attached product.'
      if (templatePrompts) {
        idea += `\n\nFollow these video template styles and conventions: ${templatePrompts}`
      }
      const { data, error: invokeErr } = await supabase.functions.invoke('scenario-write', {
        body: {
          mode: 'product-ad',
          idea,
          durationSeconds: duration,
          imageUrl: uploadedImageUrl ?? undefined,
          productName: productName.trim() || undefined,
          productDescription: productDescription.trim() || undefined,
          cameraStyle,
          cameraMovement: cameraMovement.trim() || undefined,
          genre: GENRE_TEMPLATES.find((g) => g.id === genre)?.prompt || undefined,
          scene: SCENE_TEMPLATES.find((s) => s.id === scene)?.prompt || undefined,
        },
      })
      if (invokeErr) {
        setError(invokeErr.message || 'Failed to write ad scenario')
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

  function handleUseAsPrompt() {
    if (scenes.length === 0) return
    onUseAsPrompt(scenes.join('\n\n'), uploadedImageUrl ?? undefined)
    onOpenChange(false)
  }

  async function handleSendAll() {
    if (scenes.length < 2 || !onSendScenes || isSending) return
    setIsSending(true)
    setError(null)
    try {
      await onSendScenes(scenes, uploadedImageUrl ?? undefined)
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
    setCameraStyle(CAMERA_STYLES[0].label)
    setCameraMovement('')
    setGenre('')
    setScene('')
    setTemplateIds(new Set())
    setScenes([])
    setError(null)
    setCopiedIndex(null)
    setIsSending(false)
    clearImage()
  }

  const isSplit = SPLIT_DURATIONS.includes(duration) && scenes.length > 1
  const concatenated = scenes.join('\n\n')
  const canGenerate = (userPrompt.trim().length > 0 || productName.trim().length > 0 || Boolean(uploadedImageUrl)) && !isUploadingImage
  const t = T[lang]
  const dir = lang === 'fa' ? 'rtl' : 'ltr'

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
            <Package className="h-5 w-5 text-amber-300" aria-hidden="true" />
            {t.title}
            <button
              type="button"
              onClick={() => setLang((l) => (l === 'en' ? 'fa' : 'en'))}
              title={t.translate}
              aria-label={t.translate}
              className="ms-auto inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 transition hover:border-amber-300/40 hover:text-amber-100"
            >
              <Languages className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
              {lang === 'en' ? 'فارسی' : 'EN'}
            </button>
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
            <div className="relative shrink-0">
              {imagePreviewUrl ? (
                <div className="relative">
                  <img
                    src={imagePreviewUrl}
                    alt="Product"
                    className="h-20 w-20 rounded-md border border-white/10 object-cover"
                  />
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
                const active = cameraStyle === style.label
                return (
                  <button
                    key={style.label}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCameraStyle(style.label)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
                        : 'border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className="text-sm leading-none">{style.icon}</span>
                    {style.label}
                  </button>
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
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={g.prompt}
                    onClick={() => setGenre((cur) => (cur === g.id ? '' : g.id))}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
                        : 'border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className="text-sm leading-none">{g.icon}</span>
                    {g.label}
                  </button>
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
                    {group}
                  </div>
                  <div role="radiogroup" aria-label={group} className="flex flex-wrap gap-2">
                    {SCENE_TEMPLATES.filter((s) => s.group === group).map((s) => {
                      const active = scene === s.id
                      return (
                        <button
                          key={s.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          title={s.prompt}
                          onClick={() => setScene((cur) => (cur === s.id ? '' : s.id))}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            active
                              ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
                              : 'border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <span className="text-sm leading-none">{s.icon}</span>
                          {s.label}
                        </button>
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
                    {lang === 'fa' ? VIDEO_GROUP_FA[group] : group}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {VIDEO_TEMPLATES.filter((v) => v.group === group).map((v) => {
                      const active = templateIds.has(v.id)
                      return (
                        <button
                          key={v.id}
                          type="button"
                          aria-pressed={active}
                          title={v.prompt}
                          onClick={() => toggleTemplate(v.id)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            active
                              ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
                              : 'border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <span className="text-sm leading-none">{v.icon}</span>
                          {lang === 'fa' ? v.labelFa : v.label}
                        </button>
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
                      Scene {i + 1} ({sceneRange(i)})
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
                      {copiedIndex === i ? 'Copied' : 'Copy'}
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
                Ad scenario ({duration}s)
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
                {copiedIndex === -1 ? 'Copied' : isSplit ? 'Copy all' : 'Copy'}
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
                Regenerate
              </Button>
              {isSplit && onSendScenes ? (
                <Button size="sm" onClick={handleSendAll} disabled={isWriting || isSending}>
                  {isSending ? (
                    <LoaderCircle className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                  )}
                  Send all to Pending
                </Button>
              ) : (
                <Button size="sm" onClick={handleUseAsPrompt} disabled={isWriting || isSending}>
                  <Wand2 className="h-4 w-4 mr-2" aria-hidden="true" />
                  Use as prompt
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
              Generate ad scenario
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
