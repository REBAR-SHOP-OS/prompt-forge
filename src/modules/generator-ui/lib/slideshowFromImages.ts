// Image-only Final Film compositor.
//
// Builds a single WebM slideshow from a list of still images + per-clip
// overlays (text/image burn-in). Used when every Final Film card is an
// uploaded image — avoids the brittle MP4 + manual-frame path used for
// mixed video sequences.
//
// Output is `video/webm` (vp9 → vp8 → webm fallback). It plays in every
// modern browser, supports a proper duration header, and is reliable for
// canvas-only sources (no source <video> required).

import {
  paintOverlays,
  preloadOverlayImages,
  ensureFontsLoaded,
  type ClipOverlay,
} from './overlays'

export interface SlideshowImage {
  url: string                 // resolved (signed) image URL
  durationSec: number         // seconds to display this image
  overlays?: ClipOverlay[]    // overlays to burn in (text/image)
}

export interface SlideshowProgress {
  ratio: number               // 0..1 over the whole slideshow
  clipIndex: number           // 1-based current image
  totalClips: number
}

export interface SlideshowResult {
  blob: Blob
  mimeType: string
  extension: 'webm'
}

function pickWebmMime(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  for (const mt of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mt)) {
      return mt
    }
  }
  return 'video/webm'
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, cw, ch)
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  if (!iw || !ih) return
  const scale = Math.min(cw / iw, ch / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh)
}

export async function buildImageSlideshow(
  images: SlideshowImage[],
  onProgress?: (p: SlideshowProgress) => void,
): Promise<SlideshowResult> {
  if (images.length === 0) throw new Error('No images to merge')

  // Pre-load image bitmaps and overlay assets up front so playback is gap-free.
  const loaded: { img: HTMLImageElement; durationSec: number; overlays?: ClipOverlay[] }[] = []
  for (const im of images) {
    const img = await loadImage(im.url)
    loaded.push({
      img,
      durationSec: Math.max(0.5, im.durationSec || 3),
      overlays: im.overlays,
    })
  }

  const allOverlays: ClipOverlay[] = []
  for (const l of loaded) if (l.overlays?.length) allOverlays.push(...l.overlays)
  const overlayImageMap = allOverlays.length > 0
    ? await preloadOverlayImages(allOverlays)
    : new Map()
  if (allOverlays.length > 0) await ensureFontsLoaded(allOverlays)

  // Pick canvas dimensions from the first image (capped for sanity).
  const first = loaded[0].img
  const width = Math.max(640, Math.min(1920, Math.floor(first.naturalWidth || 1280)))
  const height = Math.max(360, Math.min(1920, Math.floor(first.naturalHeight || 720)))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D not supported')

  // Paint the first image once before recording starts so the output never
  // begins with a black frame.
  drawImageContain(ctx, loaded[0].img, width, height)
  if (loaded[0].overlays?.length) {
    paintOverlays(ctx, width, height, loaded[0].overlays, overlayImageMap)
  }

  const fps = 30
  const stream = canvas.captureStream(fps)
  const mimeType = pickWebmMime()
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data) }
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })

  recorder.start(250)

  const totalDuration = loaded.reduce((s, l) => s + l.durationSec, 0)
  let elapsedBefore = 0

  // Animation tick: continuously repaint the *current* image + overlays so
  // the captured stream has fresh frames even though the source is static.
  let currentIndex = 0
  let segmentStart = performance.now()
  let stop = false

  const tick = () => {
    if (stop) return
    const now = performance.now()
    const seg = loaded[currentIndex]
    const elapsedSeg = (now - segmentStart) / 1000
    if (elapsedSeg >= seg.durationSec) {
      elapsedBefore += seg.durationSec
      currentIndex += 1
      if (currentIndex >= loaded.length) {
        // Hold the very last frame for one more RAF, then bail out.
        requestAnimationFrame(() => { /* noop */ })
        return
      }
      segmentStart = now
      onProgress?.({
        ratio: Math.min(1, elapsedBefore / totalDuration),
        clipIndex: currentIndex + 1,
        totalClips: loaded.length,
      })
    }
    const cur = loaded[currentIndex]
    drawImageContain(ctx, cur.img, width, height)
    if (cur.overlays?.length) {
      paintOverlays(ctx, width, height, cur.overlays, overlayImageMap)
    }
    requestAnimationFrame(tick)
  }
  onProgress?.({ ratio: 0, clipIndex: 1, totalClips: loaded.length })
  segmentStart = performance.now()
  requestAnimationFrame(tick)

  // Wait for the full timeline plus a small flush window for MediaRecorder.
  await new Promise((r) => setTimeout(r, totalDuration * 1000 + 350))
  stop = true
  recorder.stop()
  await stopped

  onProgress?.({ ratio: 1, clipIndex: loaded.length, totalClips: loaded.length })

  const blob = new Blob(chunks, { type: mimeType })
  if (blob.size < 1024) {
    throw new Error('Slideshow output is empty — please retry.')
  }
  return { blob, mimeType, extension: 'webm' }
}
