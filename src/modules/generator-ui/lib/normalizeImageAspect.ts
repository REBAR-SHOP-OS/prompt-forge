// Normalizes a data URL image to an exact target aspect ratio using
// center-crop ("cover"). Guarantees the returned dataUrl matches the ratio
// regardless of what the AI model produced.

export type AspectRatio = '1:1' | '9:16' | '16:9'

const RATIO_VALUES: Record<AspectRatio, number> = {
  '1:1': 1,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
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
  dataUrl: string,
  aspect: AspectRatio,
): Promise<string> {
  const target = RATIO_VALUES[aspect]
  const img = await loadImage(dataUrl)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return dataUrl

  const current = w / h
  // Already within 0.5% of target — keep as-is.
  if (Math.abs(current - target) / target < 0.005) return dataUrl

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
  if (!ctx) return dataUrl
  ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, cropW, cropH)
  return canvas.toDataURL('image/png')
}
