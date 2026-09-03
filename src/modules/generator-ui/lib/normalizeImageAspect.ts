// Normalizes an image URL to an exact target aspect ratio. The default
// center-crop ("cover") behavior is retained for generated images; product
// start frames can opt into "contain" so the complete product stays visible.

export type AspectRatio = '1:1' | '9:16' | '16:9'
export type ImageAspectFit = 'cover' | 'contain'

export type NormalizeImageAspectOptions = {
  fit?: ImageAspectFit
  backgroundColor?: string
}

const RATIO_VALUES: Record<AspectRatio, number> = {
  '1:1': 1,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
}

const OUTPUT_DIMS: Record<AspectRatio, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e instanceof Error ? e : new Error('Failed to load image'))
    img.src = src
  })
}

export async function normalizeImageAspect(
  imageUrl: string,
  aspect: AspectRatio,
  options: NormalizeImageAspectOptions = {},
): Promise<string> {
  const target = RATIO_VALUES[aspect]
  const img = await loadImage(imageUrl)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return imageUrl

  const current = w / h
  // Already within 0.5% of target — keep as-is.
  if (Math.abs(current - target) / target < 0.005) return imageUrl

  if (options.fit === 'contain') {
    const { width, height } = OUTPUT_DIMS[aspect]
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return imageUrl

    ctx.fillStyle = options.backgroundColor ?? '#ffffff'
    ctx.fillRect(0, 0, width, height)
    const scale = Math.min(width / w, height / h)
    const drawW = w * scale
    const drawH = h * scale
    const dx = (width - drawW) / 2
    const dy = (height - drawH) / 2
    ctx.drawImage(img, dx, dy, drawW, drawH)
    return canvas.toDataURL('image/png')
  }

  // Cover-crop: keep the larger axis, crop the other one centered.
  let cropW = w
  let cropH = h
  if (current > target) {
    // Image is wider than target → crop horizontally.
    cropW = Math.round(h * target)
    cropH = h
  } else {
    // Image is taller than target → crop vertically.
    cropW = w
    cropH = Math.round(w / target)
  }
  const sx = Math.max(0, Math.round((w - cropW) / 2))
  const sy = Math.max(0, Math.round((h - cropH) / 2))

  const canvas = document.createElement('canvas')
  canvas.width = cropW
  canvas.height = cropH
  const ctx = canvas.getContext('2d')
  if (!ctx) return imageUrl
  ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, cropW, cropH)
  return canvas.toDataURL('image/png')
}
