// Shared style datasets for prompt optimization.
// Used by the composer's "Styles" picker (DashboardPage) to build style hints
// that are sent to the enhance-prompt edge function so the rewritten prompt is
// optimized around the user's chosen camera/genre/scene/template styles.

export type StyleItem = {
  id: string
  label: string
  icon: string
  /** A short directing/style fragment appended to the prompt-optimization hint. */
  prompt: string
  /** Optional grouping label (for scene & template categories). */
  group?: string
}

export type StyleSelection = {
  camera: string[]
  genre: string[]
  scene: string[]
  template: string[]
}

export const emptyStyleSelection = (): StyleSelection => ({
  camera: [],
  genre: [],
  scene: [],
  template: [],
})

// ---------------- Camera styles ----------------
export const CAMERA_STYLES: StyleItem[] = [
  { id: 'whip-pan', label: 'Whip Pan', icon: '💫', prompt: 'Whip pan camera move: a very fast horizontal swing of the camera with heavy motion blur connecting beats energetically.' },
  { id: 'orbit', label: 'Orbit Shot', icon: '🛰️', prompt: 'Orbit shot: the camera smoothly circles around the subject keeping it centered, revealing depth and dimension.' },
  { id: 'fpv-drone', label: 'FPV Drone', icon: '🚁', prompt: 'FPV drone camera: fast immersive flying motion that dives, weaves and accelerates through the scene.' },
  { id: 'tracking', label: 'Tracking Shot', icon: '🎯', prompt: 'Tracking shot: the camera follows the moving subject at a steady distance, keeping it locked in frame.' },
  { id: 'push-in', label: 'Push In Cinematic', icon: '🎬', prompt: 'Cinematic push-in: a slow deliberate dolly toward the subject building tension and focus.' },
  { id: 'fly-through', label: 'Fly Through', icon: '🕊️', prompt: 'Fly-through camera: the camera glides continuously through openings and spaces in one seamless flowing move.' },
  { id: 'crash-zoom', label: 'Crash Zoom', icon: '💥', prompt: 'Crash zoom: an abrupt, punchy snap zoom onto the subject for dramatic emphasis.' },
  { id: 'handheld', label: 'Handheld Dynamic', icon: '🤳', prompt: 'Dynamic handheld camera: natural shake and reactive movement for raw, energetic realism.' },
  { id: 'dolly-zoom', label: 'Dolly Zoom', icon: '🌀', prompt: 'Dolly zoom (vertigo effect): the camera dollies while zooming the opposite way, warping the background perspective.' },
  { id: 'parallax', label: 'Parallax Motion', icon: '🧊', prompt: 'Parallax motion: layered foreground and background move at different speeds creating a strong sense of depth.' },
]

// ---------------- Genre & atmosphere ----------------
export const GENRE_STYLES: StyleItem[] = [
  { id: 'epic-fantasy', label: 'Epic Fantasy', icon: '🐉', prompt: 'Epic fantasy directing: sweeping wide vistas of dreamlike landscapes, castles and mythical creatures, magical glowing lighting and an awe-inspiring heroic mood.' },
  { id: 'sci-fi-minimalist', label: 'Sci-Fi Minimalist', icon: '🛸', prompt: 'Minimalist sci-fi directing: clean white spaces, straight lines, hidden seamless technology and a calm, sleek futuristic atmosphere.' },
  { id: 'post-apocalyptic', label: 'Post-Apocalyptic', icon: '☢️', prompt: 'Post-apocalyptic directing: ruined cities, nature overgrowing buildings, ash, dust and a desolate abandoned atmosphere with muted desaturated tones.' },
  { id: 'horror-jump-scare', label: 'Horror Jump-Scare', icon: '👻', prompt: 'Sudden-horror directing: deep darkness, harsh localized light, tense silence and abrupt movement changes that create dread and fear.' },
  { id: 'high-octane-action', label: 'High-Octane Action', icon: '🔥', prompt: 'High-octane action directing: rapid cuts, camera shake, explosions, high speed and motion blur for an intense adrenaline-fueled feel.' },
  { id: 'romantic-dreamscape', label: 'Romantic Dreamscape', icon: '💗', prompt: 'Romantic dreamscape directing: soft golden-hour sunlight, gentle soft focus on the subjects and warm dreamy colors for an intimate emotional mood.' },
  { id: 'documentary-realism', label: 'Documentary / Realism', icon: '🎥', prompt: 'Documentary realism directing: natural light, no stylized grading, true-to-life colors and simple unobtrusive camera movements for an authentic real feel.' },
  { id: 'anime-manga', label: 'Anime / Manga Style', icon: '🌸', prompt: 'Anime/manga style directing: bold outline lines, saturated flat 2D colors and exaggerated dynamic motion effects with expressive energetic action.' },
]

// ---------------- Scene & environment ----------------
const G_INDUSTRIAL = 'Industrial & Construction'
const G_URBAN = 'Urban & Modern'
const G_NATURE = 'Natural & Epic Landscapes'
const G_HISTORICAL = 'Historical & Fantasy'
const G_INTERIOR = 'Interior & Moody'

export const SCENE_STYLES: StyleItem[] = [
  { id: 'construction-site', label: 'Construction Site', icon: '🏗️', group: G_INDUSTRIAL, prompt: 'Construction site environment: steel building skeletons, giant moving cranes, dust and dirt, hard-hat workers at sunset.' },
  { id: 'heavy-industry', label: 'Heavy Industry Factory', icon: '🏭', group: G_INDUSTRIAL, prompt: 'Heavy industry factory environment: molten iron, welding sparks, large gear machinery and huge smokestacks.' },
  { id: 'abandoned-warehouse', label: 'Abandoned Warehouse', icon: '🕸️', group: G_INDUSTRIAL, prompt: 'Abandoned warehouse environment: large empty space, broken windows, light beams piercing from the roof and dust floating in the air.' },
  { id: 'shipyard-dock', label: 'Shipyard / Dock', icon: '🚢', group: G_INDUSTRIAL, prompt: 'Shipyard and dock environment: giant container ships, coastal cranes, seawater and rusty steel structures.' },
  { id: 'high-tech-lab', label: 'High-Tech Laboratory', icon: '🔬', group: G_INDUSTRIAL, prompt: 'High-tech laboratory environment: clean white walls, blinking computer server racks, glass chambers and cold blue or laser lighting.' },
  { id: 'megacity-corporate', label: 'Megacity Corporate', icon: '🏙️', group: G_URBAN, prompt: 'Megacity corporate environment: giant glass skyscrapers, clouds reflecting on the glass and a sleek upscale business atmosphere.' },
  { id: 'cyberpunk-alleyway', label: 'Cyberpunk Alleyway', icon: '🌃', group: G_URBAN, prompt: 'Cyberpunk alleyway environment: crowded narrow streets at night, multilingual neon signs, hanging wires and street-food kiosks.' },
  { id: 'subway-station', label: 'Subway / Underground Station', icon: '🚇', group: G_URBAN, prompt: 'Subway station environment: dark tunnels, fast moving trains with motion blur and concrete platforms under fluorescent light.' },
  { id: 'rooftop-overlook', label: 'Rooftop Overlook', icon: '🌆', group: G_URBAN, prompt: 'Rooftop overlook environment: the edge of a tall tower rooftop at night while the whole city lights glow in the background with cinematic bokeh.' },
  { id: 'epic-mountain', label: 'Epic Mountain Range', icon: '🏔️', group: G_NATURE, prompt: 'Epic mountain range environment: sharp snowy peaks, thick fog in the valleys and steep cliffs.' },
  { id: 'apocalyptic-wasteland', label: 'Post-Apocalyptic Wasteland', icon: '🏜️', group: G_NATURE, prompt: 'Post-apocalyptic wasteland environment: endless sand plains, abandoned worn vehicles, dusty sky and a scorching sun.' },
  { id: 'mystical-forest', label: 'Deep Mystical Forest', icon: '🌲', group: G_NATURE, prompt: 'Deep mystical forest environment: ancient tall trees, dense foliage, light filtered through leaves reaching the ground and a misty atmosphere.' },
  { id: 'arctic-tundra', label: 'Arctic Tundra / Ice Landscape', icon: '❄️', group: G_NATURE, prompt: 'Arctic tundra ice landscape environment: endless white plains, ice caves with blue light reflections and a snowstorm.' },
  { id: 'medieval-castle', label: 'Medieval Castle / Citadel', icon: '🏰', group: G_HISTORICAL, prompt: 'Medieval castle environment: large stone walls, lit torches on the walls and dark halls with long wooden tables.' },
  { id: 'ancient-ruins', label: 'Ancient Ruins', icon: '🏛️', group: G_HISTORICAL, prompt: 'Ancient ruins environment: cracked Greek or Egyptian stone columns covered in vines, set in a desert or forest.' },
  { id: 'gothic-cathedral', label: 'Gothic Cathedral', icon: '⛪', group: G_HISTORICAL, prompt: 'Gothic cathedral environment: pointed architecture and large stained-glass windows casting colorful light into a vast dark hall.' },
  { id: 'steampunk-workshop', label: 'Steampunk Workshop', icon: '⚙️', group: G_HISTORICAL, prompt: 'Steampunk workshop environment: copper pipes, gauge dials, steam and intricate 19th-century mechanical tools.' },
  { id: 'jazz-club', label: 'Dimly Lit Jazz Club', icon: '🎷', group: G_INTERIOR, prompt: 'Dimly lit jazz club environment: a cozy space, cigarette smoke hanging in spot lighting, shiny brass instruments and dark leather furniture.' },
  { id: 'dark-academia-library', label: 'Dark Academia Library', icon: '📚', group: G_INTERIOR, prompt: 'Dark academia library environment: tall wooden shelves full of old leather books, study desks with green lamps and the scent of old paper.' },
  { id: 'retro-diner', label: 'Retro Diner', icon: '🍔', group: G_INTERIOR, prompt: 'Retro 80s diner environment: red leather booths, neon interior decor, a jukebox and rain-streaked windows at night.' },
]

// ---------------- Video templates ----------------
const VG_SPORTS = 'Sports & Action'
const VG_ANIMATION = 'Animation & Motion Graphics'
const VG_SOCIAL = 'Social Media'
const VG_CORPORATE = 'Corporate & Business'
const VG_CINEMATIC = 'Cinematic & Creative'
const VG_EVENTS = 'Events & Occasions'
const VG_EXPLAINER = 'Explainer & Educational'

export const TEMPLATE_STYLES: StyleItem[] = [
  { id: 'football-team', label: 'Football / Team Sports', icon: '⚽', group: VG_SPORTS, prompt: 'Sports broadcast template: team line-up reveals, player profile cards, animated live-score lower thirds and refereeing graphics with energetic stadium atmosphere.' },
  { id: 'sports-highlights', label: 'Sports Highlights', icon: '🏆', group: VG_SPORTS, prompt: 'Sports highlights template: fast transitions, high-energy effects and jump cuts to showcase goals and decisive match moments.' },
  { id: 'fitness', label: 'Fitness & Bodybuilding', icon: '💪', group: VG_SPORTS, prompt: 'Fitness template: motivational footage cut to a fast music tempo, promoting gyms or training programs with dynamic energy.' },
  { id: 'gaming-esports', label: 'Gaming / Esports', icon: '🎮', group: VG_SPORTS, prompt: 'Gaming and esports template: stream channel intros, on-screen overlays and team reveals with neon glowing effects.' },
  { id: 'explainer', label: 'Explainer Video', icon: '🧩', group: VG_ANIMATION, prompt: '2D/3D explainer template: animated characters explaining a system, product or service with clean motion graphics.' },
  { id: 'logo-reveal', label: 'Logo Reveal', icon: '✨', group: VG_ANIMATION, prompt: 'Logo reveal template: short, eye-catching few-second animation introducing a brand logo at the start of videos.' },
  { id: 'kinetic-typography', label: 'Kinetic Typography', icon: '🔤', group: VG_ANIMATION, prompt: 'Kinetic typography template: built entirely on creative, rhythmic animated text synced to the beat.' },
  { id: 'motion-comic', label: 'Motion Comics', icon: '💥', group: VG_ANIMATION, prompt: 'Motion comic template: animated comic-book panels and visual storytelling with painterly comic effects.' },
  { id: 'youtube-intro-outro', label: 'YouTube Intro & Outro', icon: '▶️', group: VG_SOCIAL, prompt: 'YouTube intro/outro template: opening sequences and end screens with animated like and subscribe button prompts.' },
  { id: 'instagram-reels', label: 'Instagram Story / Reels', icon: '📱', group: VG_SOCIAL, prompt: 'Vertical 9:16 template: minimal, e-commerce or lifestyle designs for quick product showcases in stories and reels.' },
  { id: 'tiktok-trends', label: 'TikTok & Trends', icon: '🎵', group: VG_SOCIAL, prompt: 'TikTok trend template: beat-synced edits and viral transitions matched to the music.' },
  { id: 'vodcast', label: 'Video Podcast (Vodcast)', icon: '🎙️', group: VG_SOCIAL, prompt: 'Video podcast template: audio spectrum visualizer and timer overlays for publishing podcasts.' },
  { id: 'company-profile', label: 'Company Profile', icon: '🏢', group: VG_CORPORATE, prompt: 'Company profile template: history and goals timeline, leadership team introductions and business vision presentation.' },
  { id: 'infographic', label: 'Presentation / Infographic', icon: '📊', group: VG_CORPORATE, prompt: 'Infographic template: animated charts, city or country maps and attractive visual presentation of statistical data.' },
  { id: 'real-estate', label: 'Real Estate', icon: '🏠', group: VG_CORPORATE, prompt: 'Real estate template: clean professional slideshows with text info to present home details and architecture projects.' },
  { id: 'product-promo', label: 'Product Promo', icon: '🛍️', group: VG_CORPORATE, prompt: 'Product promo template: 3D or video showcase of features, price and multiple angles of a new product.' },
  { id: 'movie-trailer', label: 'Movie Trailer / Teaser', icon: '🎬', group: VG_CINEMATIC, prompt: 'Cinematic trailer template: epic dramatic titles, light effects and dark atmospheric mood.' },
  { id: 'photo-slideshow', label: 'Photo / Video Slideshow', icon: '🖼️', group: VG_CINEMATIC, prompt: 'Slideshow template: artistic blend of images with soft music, suited for portfolios or travel memories.' },
  { id: 'glitch-retro', label: 'Glitch & Retro', icon: '📼', group: VG_CINEMATIC, prompt: 'Glitch and retro template: VHS tape simulation, old TV noise and 80s/90s visual styling.' },
  { id: 'vfx', label: 'VFX / Special Effects', icon: '🌩️', group: VG_CINEMATIC, prompt: 'VFX template: ready-made explosions, magic, smoke, fire and weather changes layered over raw footage.' },
  { id: 'wedding', label: 'Wedding & Formal', icon: '💍', group: VG_EVENTS, prompt: 'Wedding template: romantic slideshows with warm color grading, floral frames, delicate typography and soft light leaks.' },
  { id: 'birthday-party', label: 'Birthday & Party', icon: '🎉', group: VG_EVENTS, prompt: 'Birthday and party template: colorful, joyful video invitations with balloon and confetti animations.' },
  { id: 'calendar-campaigns', label: 'Holidays & Campaigns', icon: '🎄', group: VG_EVENTS, prompt: 'Seasonal campaign template: tailored for Christmas, Halloween, Nowruz, Ramadan, Black Friday and seasonal discount sales.' },
  { id: 'whiteboard', label: 'Whiteboard Animation', icon: '✍️', group: VG_EXPLAINER, prompt: 'Whiteboard animation template: a visible hand drawing simple sketches and text on a white board, building the explanation step by step with marker strokes.' },
  { id: 'blackboard', label: 'Blackboard Animation', icon: '🟢', group: VG_EXPLAINER, prompt: 'Blackboard animation template: chalk-style white and colored drawings appearing on a dark blackboard, nostalgic classroom feel with hand-drawn diagrams.' },
  { id: 'glassboard', label: 'Glassboard Animation', icon: '🟩', group: VG_EXPLAINER, prompt: 'Glassboard animation template: a real presenter behind a transparent glass writing with glowing neon markers, mirrored so the text reads correctly, dark studio background.' },
  { id: 'line-art', label: 'Line Art Animation', icon: '〰️', group: VG_EXPLAINER, prompt: 'Line art animation template: continuous single-line illustrations with no fill, lines flowing smoothly and morphing from one shape into the next.' },
  { id: 'infographic-motion', label: 'Infographic Animation', icon: '📊', group: VG_EXPLAINER, prompt: 'Infographic animation template: animated charts, graphs, percentages and data visualizations that bring statistics to life for easy digestion.' },
  { id: 'flat-2d', label: '2D Flat Animation', icon: '🟦', group: VG_EXPLAINER, prompt: '2D flat animation template: solid flat colors, no complex shadows and simple clean characters, ideal for startup explainer videos.' },
  { id: 'isometric', label: 'Isometric Animation', icon: '📐', group: VG_EXPLAINER, prompt: 'Isometric animation template: 2D illustrations drawn at a 30-degree angle to convey depth, great for showing cities, system architecture and technology.' },
  { id: 'character-2d', label: '2D Character Animation', icon: '🧍', group: VG_EXPLAINER, prompt: '2D character animation template: a central character facing a problem, then the product or idea introduced as the solution, narrative-driven storytelling.' },
  { id: 'cut-out', label: 'Cut-out Animation', icon: '✂️', group: VG_EXPLAINER, prompt: 'Cut-out animation template: characters and environments built from cut paper or cardboard pieces, giving a playful handmade crafty feel.' },
  { id: 'stop-motion', label: 'Stop Motion', icon: '🧩', group: VG_EXPLAINER, prompt: 'Stop motion template: frame-by-frame photography of real objects like clay, Lego or everyday items, played fast to create the illusion of movement.' },
  { id: 'screencast-ui', label: 'Screencast / UI Animation', icon: '🖥️', group: VG_EXPLAINER, prompt: 'Screencast / UI animation template: an app or website interface shown with smooth animated buttons, menus and zoom highlights instead of a plain screen recording.' },
  { id: 'live-action-tracked', label: 'Live-Action + Tracked Graphics', icon: '🎞️', group: VG_EXPLAINER, prompt: 'Live-action with tracked elements template: real footage of people or environments with 3D floating graphics, numbers and text tracked into the scene.' },
]

export const SCENE_GROUP_ORDER = [G_INDUSTRIAL, G_URBAN, G_NATURE, G_HISTORICAL, G_INTERIOR]
export const TEMPLATE_GROUP_ORDER = [
  VG_SPORTS,
  VG_ANIMATION,
  VG_SOCIAL,
  VG_CORPORATE,
  VG_CINEMATIC,
  VG_EVENTS,
  VG_EXPLAINER,
]

export function countSelectedStyles(sel: StyleSelection): number {
  return sel.camera.length + sel.genre.length + sel.scene.length + sel.template.length
}

const fragmentsFor = (items: StyleItem[], ids: string[]): string[] =>
  ids
    .map((id) => items.find((it) => it.id === id)?.prompt)
    .filter((p): p is string => Boolean(p))

/** Build a single style-hint string from the user's selection. */
export function buildStyleHints(sel: StyleSelection): string {
  const parts: string[] = []
  const camera = fragmentsFor(CAMERA_STYLES, sel.camera)
  const genre = fragmentsFor(GENRE_STYLES, sel.genre)
  const scene = fragmentsFor(SCENE_STYLES, sel.scene)
  const template = fragmentsFor(TEMPLATE_STYLES, sel.template)
  if (camera.length) parts.push(`Camera style: ${camera.join(' ')}`)
  if (genre.length) parts.push(`Genre & atmosphere: ${genre.join(' ')}`)
  if (scene.length) parts.push(`Scene & environment: ${scene.join(' ')}`)
  if (template.length) parts.push(`Video template: ${template.join(' ')}`)
  return parts.join('\n')
}
