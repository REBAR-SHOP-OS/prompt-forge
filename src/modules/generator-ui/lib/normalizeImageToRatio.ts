// Normalize an uploaded frame image to the user's selected aspect ratio.
// Letterbox/pillarbox the source image (object-contain) inside the target
// canvas filled with black, so the WHOLE image is visible inside the chosen
// frame — never cropped. The resulting blob can be re-uploaded and sent to
// the provider so the generated video honors both the image content and the
// requested ratio.

export type FrameRatio = '9:16' | '1:1' | '16:9'

function ratioToWH(ratio: FrameRatio): { w: number; h: number } {
  switch (ratio) {
    case '9:16':
      return { w: 720, h: 1280 }
    case '1:1':
      return { w: 1024, h: 1024 }
    case '16:9':
    default:
      return { w: 1280, h: 720 }
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

/**
 * Render `srcUrl` letterboxed inside a canvas of the given aspect ratio.
 * Returns a PNG Blob whose pixel dimensions match the target ratio exactly.
 */
export async function normalizeImageToRatio(
  srcUrl: string,
  ratio: FrameRatio,
): Promise<Blob> {
  const img = await loadImage(srcUrl)
  const { w, h } = ratioToWH(ratio)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D not supported')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)

  const sw = img.naturalWidth || w
  const sh = img.naturalHeight || h
  const scale = Math.min(w / sw, h / sh)
  const dw = sw * scale
  const dh = sh * scale
  const dx = (w - dw) / 2
  const dy = (h - dh) / 2

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, dx, dy, dw, dh)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/png',
      0.95,
    )
  })
}
