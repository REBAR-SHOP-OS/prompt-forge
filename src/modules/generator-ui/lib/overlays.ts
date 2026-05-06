// Shared overlay types + canvas painting helpers used by both the live UI
// (ClipOverlayLayer) and the Final Film burn-in pipeline (mergeVideos +
// imageToClip).

export type OverlayKind = 'text' | 'image'
export type OverlayClipKind = 'video' | 'image'

export interface ClipOverlay {
  id: string
  user_id: string
  clip_kind: OverlayClipKind
  clip_id: string
  kind: OverlayKind
  x: number          // 0..1, center
  y: number          // 0..1, center
  scale: number      // width relative to container width (0..1)
  rotation: number   // degrees
  z_index: number
  text_value: string | null
  font_family: string | null
  font_weight: number | null
  color: string | null
  bg_color: string | null
  text_align: 'left' | 'center' | 'right' | null
  image_path: string | null
  image_url: string | null
  created_at: string
}

export const OVERLAY_FONT_PRESETS = [
  { id: 'Inter', label: 'Inter (Sans)' },
  { id: 'Vazirmatn', label: 'Vazirmatn (فارسی)' },
  { id: 'Playfair Display', label: 'Playfair (Serif)' },
  { id: 'Roboto Mono', label: 'Roboto Mono' },
  { id: 'Bebas Neue', label: 'Bebas Neue' },
] as const

export const OVERLAY_WEIGHT_PRESETS = [
  { value: 400, label: 'Regular' },
  { value: 600, label: 'Semibold' },
  { value: 800, label: 'Bold' },
] as const

export const DEFAULT_TEXT_OVERLAY: Omit<ClipOverlay, 'id' | 'user_id' | 'clip_kind' | 'clip_id' | 'created_at'> = {
  kind: 'text',
  x: 0.5,
  y: 0.5,
  scale: 0.5,
  rotation: 0,
  z_index: 0,
  text_value: 'Your text',
  font_family: 'Inter',
  font_weight: 700,
  color: '#ffffff',
  bg_color: null,
  text_align: 'center',
  image_path: null,
  image_url: null,
}

export const DEFAULT_IMAGE_OVERLAY: Omit<ClipOverlay, 'id' | 'user_id' | 'clip_kind' | 'clip_id' | 'created_at'> = {
  kind: 'image',
  x: 0.5,
  y: 0.5,
  scale: 0.25,
  rotation: 0,
  z_index: 0,
  text_value: null,
  font_family: null,
  font_weight: null,
  color: null,
  bg_color: null,
  text_align: null,
  image_path: null,
  image_url: null,
}

// ---------------------------------------------------------------------------
// Image preloading

export type LoadedOverlayImages = Map<string, HTMLImageElement>

export async function preloadOverlayImages(
  overlays: ClipOverlay[],
): Promise<LoadedOverlayImages> {
  const map: LoadedOverlayImages = new Map()
  const tasks: Promise<void>[] = []
  for (const o of overlays) {
    if (o.kind !== 'image' || !o.image_url) continue
    if (map.has(o.id)) continue
    const url = o.image_url
    tasks.push(new Promise<void>((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => { map.set(o.id, img); resolve() }
      img.onerror = () => { resolve() }
      img.src = url
    }))
  }
  await Promise.all(tasks)
  return map
}

export async function ensureFontsLoaded(overlays: ClipOverlay[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) return
  const families = new Set<string>()
  for (const o of overlays) {
    if (o.kind === 'text' && o.font_family) families.add(o.font_family)
  }
  await Promise.all(
    Array.from(families).map((f) =>
      Promise.all([
        document.fonts.load(`400 48px "${f}"`),
        document.fonts.load(`700 48px "${f}"`),
      ]).catch(() => {}),
    ),
  )
}

// ---------------------------------------------------------------------------
// Canvas painting

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const rawLine of text.split('\n')) {
    if (!rawLine) { lines.push(''); continue }
    const words = rawLine.split(/\s+/)
    let current = ''
    for (const word of words) {
      const test = current ? `${current} ${word}` : word
      if (ctx.measureText(test).width <= maxWidth) {
        current = test
      } else {
        if (current) lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

export function paintOverlays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  overlays: ClipOverlay[],
  loadedImages?: LoadedOverlayImages,
): void {
  if (!overlays || overlays.length === 0) return
  const sorted = [...overlays].sort((a, b) => a.z_index - b.z_index)
  for (const o of sorted) {
    ctx.save()
    const cx = o.x * width
    const cy = o.y * height
    ctx.translate(cx, cy)
    if (o.rotation) ctx.rotate((o.rotation * Math.PI) / 180)

    if (o.kind === 'text') {
      const text = (o.text_value ?? '').trim()
      if (!text) { ctx.restore(); continue }
      const family = o.font_family || 'Inter'
      const weight = o.font_weight || 700
      // Reference text size is proportional to width so it scales with output res.
      const boxWidth = Math.max(40, o.scale * width)
      // Initial font size relative to scale; adjust to fit boxWidth roughly.
      const fontSize = Math.max(14, Math.round(boxWidth * 0.18))
      ctx.font = `${weight} ${fontSize}px "${family}", sans-serif`
      ctx.textBaseline = 'middle'
      ctx.textAlign = (o.text_align as CanvasTextAlign) || 'center'

      const lines = wrapText(ctx, text, boxWidth)
      const lineHeight = Math.round(fontSize * 1.2)
      const totalHeight = lines.length * lineHeight
      const padX = Math.round(fontSize * 0.4)
      const padY = Math.round(fontSize * 0.25)

      if (o.bg_color) {
        // Determine widest line for bg
        let maxW = 0
        for (const l of lines) maxW = Math.max(maxW, ctx.measureText(l).width)
        const bgW = maxW + padX * 2
        const bgH = totalHeight + padY * 2
        ctx.fillStyle = o.bg_color
        ctx.fillRect(-bgW / 2, -bgH / 2, bgW, bgH)
      }

      ctx.fillStyle = o.color || '#ffffff'
      const startY = -totalHeight / 2 + lineHeight / 2
      for (let i = 0; i < lines.length; i++) {
        const x = ctx.textAlign === 'left' ? -boxWidth / 2 + padX
          : ctx.textAlign === 'right' ? boxWidth / 2 - padX
          : 0
        ctx.fillText(lines[i], x, startY + i * lineHeight)
      }
    } else if (o.kind === 'image') {
      const img = loadedImages?.get(o.id)
      if (!img) { ctx.restore(); continue }
      const targetW = Math.max(20, o.scale * width)
      const aspect = img.naturalHeight / Math.max(1, img.naturalWidth)
      const targetH = targetW * aspect
      ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH)
    }
    ctx.restore()
  }
}
