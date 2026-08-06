import { Camera, Film, Palette, Layout } from 'lucide-react'

/**
 * Placeholder preview shown when a style has no looping video clip.
 * Uses a subtle gradient + category icon so the popover still looks polished.
 */

const CATEGORY_GRADIENTS: Record<string, string> = {
  // Camera angles
  orbit: 'from-blue-900/40 to-indigo-900/40',
  tracking: 'from-blue-900/40 to-indigo-900/40',
  handheld: 'from-blue-900/40 to-indigo-900/40',
  parallax: 'from-blue-900/40 to-indigo-900/40',
  'whip-pan': 'from-blue-900/40 to-indigo-900/40',
  'push-in': 'from-blue-900/40 to-indigo-900/40',
  'fly-through': 'from-blue-900/40 to-indigo-900/40',
  'crash-zoom': 'from-blue-900/40 to-indigo-900/40',
  'dolly-zoom': 'from-blue-900/40 to-indigo-900/40',
  'fpv-drone': 'from-blue-900/40 to-indigo-900/40',
  // Genres
  'epic-fantasy': 'from-purple-900/40 to-pink-900/40',
  'sci-fi-minimal': 'from-purple-900/40 to-pink-900/40',
  'post-apocalyptic': 'from-purple-900/40 to-pink-900/40',
  horror: 'from-purple-900/40 to-pink-900/40',
  action: 'from-purple-900/40 to-pink-900/40',
  romantic: 'from-purple-900/40 to-pink-900/40',
  documentary: 'from-purple-900/40 to-pink-900/40',
  anime: 'from-purple-900/40 to-pink-900/40',
  // Scenes (construction/industrial)
  'high-rise-tower': 'from-amber-900/40 to-orange-900/40',
  'steel-framework': 'from-amber-900/40 to-orange-900/40',
  'concrete-pour': 'from-amber-900/40 to-orange-900/40',
  'rebar-site': 'from-amber-900/40 to-orange-900/40',
  'tower-crane': 'from-amber-900/40 to-orange-900/40',
  'bridge-construction': 'from-amber-900/40 to-orange-900/40',
  'road-paving': 'from-amber-900/40 to-orange-900/40',
  'tunnel-boring': 'from-amber-900/40 to-orange-900/40',
  'foundation-earthworks': 'from-amber-900/40 to-orange-900/40',
  'scaffolding-facade': 'from-amber-900/40 to-orange-900/40',
  'residential-build': 'from-amber-900/40 to-orange-900/40',
  'prefab-modular': 'from-amber-900/40 to-orange-900/40',
  'demolition-site': 'from-amber-900/40 to-orange-900/40',
  'dam-hydro': 'from-amber-900/40 to-orange-900/40',
  'refinery-build': 'from-amber-900/40 to-orange-900/40',
  'renewable-farm': 'from-amber-900/40 to-orange-900/40',
  'site-survey': 'from-amber-900/40 to-orange-900/40',
  'deep-piling': 'from-amber-900/40 to-orange-900/40',
  'formwork-shuttering': 'from-amber-900/40 to-orange-900/40',
  'precast-yard': 'from-amber-900/40 to-orange-900/40',
  'masonry-brick': 'from-amber-900/40 to-orange-900/40',
  'structural-welding': 'from-amber-900/40 to-orange-900/40',
  'curtain-wall': 'from-amber-900/40 to-orange-900/40',
  'roofing-waterproofing': 'from-amber-900/40 to-orange-900/40',
  'mep-install': 'from-amber-900/40 to-orange-900/40',
  'electrical-wiring': 'from-amber-900/40 to-orange-900/40',
  'interior-fitout': 'from-amber-900/40 to-orange-900/40',
  'plastering-finishing': 'from-amber-900/40 to-orange-900/40',
  'elevator-shaft': 'from-amber-900/40 to-orange-900/40',
  'metro-railway': 'from-amber-900/40 to-orange-900/40',
  'airport-runway': 'from-amber-900/40 to-orange-900/40',
  'port-marine': 'from-amber-900/40 to-orange-900/40',
  'canal-water': 'from-amber-900/40 to-orange-900/40',
  'pipeline-laying': 'from-amber-900/40 to-orange-900/40',
  'power-plant': 'from-amber-900/40 to-orange-900/40',
  'warehouse-logistics': 'from-amber-900/40 to-orange-900/40',
  'stadium-arena': 'from-amber-900/40 to-orange-900/40',
  'night-construction': 'from-amber-900/40 to-orange-900/40',
  // Templates
  fitness: 'from-emerald-900/40 to-teal-900/40',
  explainer: 'from-emerald-900/40 to-teal-900/40',
  vodcast: 'from-emerald-900/40 to-teal-900/40',
  infographic: 'from-emerald-900/40 to-teal-900/40',
  vfx: 'from-emerald-900/40 to-teal-900/40',
  wedding: 'from-emerald-900/40 to-teal-900/40',
  whiteboard: 'from-emerald-900/40 to-teal-900/40',
  blackboard: 'from-emerald-900/40 to-teal-900/40',
  glassboard: 'from-emerald-900/40 to-teal-900/40',
  isometric: 'from-emerald-900/40 to-teal-900/40',
  'football-team': 'from-emerald-900/40 to-teal-900/40',
  'sports-highlights': 'from-emerald-900/40 to-teal-900/40',
  'gaming-esports': 'from-emerald-900/40 to-teal-900/40',
  'logo-reveal': 'from-emerald-900/40 to-teal-900/40',
  'kinetic-typography': 'from-emerald-900/40 to-teal-900/40',
  'motion-comic': 'from-emerald-900/40 to-teal-900/40',
  'youtube-intro-outro': 'from-emerald-900/40 to-teal-900/40',
  'instagram-reels': 'from-emerald-900/40 to-teal-900/40',
  'flat-2d': 'from-emerald-900/40 to-teal-900/40',
}

function getCategoryIcon(styleId: string) {
  // Camera angles
  if (
    [
      'orbit',
      'tracking',
      'handheld',
      'parallax',
      'whip-pan',
      'push-in',
      'fly-through',
      'crash-zoom',
      'dolly-zoom',
      'fpv-drone',
    ].includes(styleId)
  ) {
    return Camera
  }
  // Genres
  if (
    [
      'epic-fantasy',
      'sci-fi-minimal',
      'post-apocalyptic',
      'horror',
      'action',
      'romantic',
      'documentary',
      'anime',
    ].includes(styleId)
  ) {
    return Palette
  }
  // Templates
  if (
    [
      'fitness',
      'explainer',
      'vodcast',
      'infographic',
      'vfx',
      'wedding',
      'whiteboard',
      'blackboard',
      'glassboard',
      'isometric',
      'football-team',
      'sports-highlights',
      'gaming-esports',
      'logo-reveal',
      'kinetic-typography',
      'motion-comic',
      'youtube-intro-outro',
      'instagram-reels',
      'flat-2d',
    ].includes(styleId)
  ) {
    return Layout
  }
  // Default = scene (construction)
  return Film
}

type Props = {
  styleId: string
  label: string
}

export function StylePreviewPlaceholder({ styleId, label }: Props) {
  const gradient = CATEGORY_GRADIENTS[styleId] ?? 'from-zinc-800 to-zinc-900'
  const Icon = getCategoryIcon(styleId)

  return (
    <div
      className={`mb-2 flex aspect-video w-full flex-col items-center justify-center rounded-md bg-gradient-to-br ${gradient} border border-white/5`}
    >
      <Icon className="h-8 w-8 text-white/40" strokeWidth={1.5} />
      <span className="mt-1.5 text-[10px] font-medium text-white/50">{label}</span>
    </div>
  )
}

export default StylePreviewPlaceholder
