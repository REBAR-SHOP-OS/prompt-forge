// Build a short video clip (webm) from a still image URL by drawing it onto
// a canvas for `durationSeconds` seconds and capturing the canvas stream.
// Used to append an "End frame" still to the end of a generated video.

function pickMimeType(): string {
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

async function loadImage(url: string): Promise<HTMLImageElement> {
  // Resolve private-bucket URLs (user-images, overlay-assets, merged-videos)
  // into short-lived signed URLs before loading.
  const { resolveSignedUrl } = await import('./signedStorageUrl')
  const resolved = await resolveSignedUrl(url)
  return await new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${resolved}`))
    img.src = resolved
  })
}

import { paintOverlays, preloadOverlayImages, ensureFontsLoaded, type ClipOverlay } from './overlays'

export async function imageUrlToClip(
  imageUrl: string,
  durationSeconds: number,
  size?: { width: number; height: number },
  overlays?: ClipOverlay[],
): Promise<Blob> {
  const img = await loadImage(imageUrl)
  const width = Math.max(640, Math.floor(size?.width ?? img.naturalWidth ?? 1280))
  const height = Math.max(360, Math.floor(size?.height ?? img.naturalHeight ?? 720))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D not supported')

  // contain
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  const dx = (width - dw) / 2
  const dy = (height - dh) / 2
  ctx.drawImage(img, dx, dy, dw, dh)

  // Preload overlay images and fonts before recording.
  const loadedOverlayImages = overlays && overlays.length > 0
    ? await preloadOverlayImages(overlays)
    : undefined
  if (overlays && overlays.length > 0) await ensureFontsLoaded(overlays)
  if (overlays && overlays.length > 0) paintOverlays(ctx, width, height, overlays, loadedOverlayImages)

  const fps = 30
  const stream = canvas.captureStream(fps)
  const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data) }
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })

  recorder.start(250)

  // Keep painting the same frame so the captured stream has continuous frames.
  let stop = false
  const tick = () => {
    if (stop) return
    ctx.drawImage(img, dx, dy, dw, dh)
    if (overlays && overlays.length > 0) paintOverlays(ctx, width, height, overlays, loadedOverlayImages)
    requestAnimationFrame(tick)
  }
  tick()

  await new Promise((r) => setTimeout(r, Math.max(500, durationSeconds * 1000)))
  stop = true
  recorder.stop()
  await stopped

  return new Blob(chunks, { type: 'video/webm' })
}
