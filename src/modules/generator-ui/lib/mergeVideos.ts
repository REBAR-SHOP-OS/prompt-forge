// In-browser video concatenation via canvas + MediaRecorder.
// Sequentially plays each source URL into a hidden <video>, paints frames
// onto a shared <canvas>, and captures the canvas stream into one webm blob.
//
// Notes:
//  - Audio is dropped in v1 (canvas/MediaRecorder audio mux is fragile).
//  - All sources are normalized to the dimensions of the FIRST clip; later
//    clips are letterboxed (object-fit: contain) onto that canvas.

export interface MergeProgress {
  /** 0..1 overall progress estimate. */
  ratio: number
  /** 1-based index of the clip currently being processed. */
  clipIndex: number
  totalClips: number
}

export type MergeProgressCallback = (p: MergeProgress) => void

function pickMimeType(withAudio: boolean): string {
  const candidates = withAudio
    ? [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=opus',
        'video/webm',
      ]
    : [
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

export interface MergeAudioOptions {
  /** Object URL or remote URL of the audio file to use as soundtrack. */
  src: string
  /** Inclusive start offset in seconds within the audio file. */
  startSec: number
  /** Exclusive end offset in seconds within the audio file. */
  endSec: number
}

async function loadVideo(url: string): Promise<HTMLVideoElement> {
  return await new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.preload = 'auto'
    v.muted = true
    v.playsInline = true
    v.src = url
    v.onloadedmetadata = () => resolve(v)
    v.onerror = () => reject(new Error(`Failed to load video: ${url}`))
  })
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  cw: number,
  ch: number,
) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, cw, ch)
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return
  const scale = Math.min(cw / vw, ch / vh)
  const dw = vw * scale
  const dh = vh * scale
  const dx = (cw - dw) / 2
  const dy = (ch - dh) / 2
  ctx.drawImage(video, dx, dy, dw, dh)
}

export async function mergeVideoUrls(
  urls: string[],
  onProgress?: MergeProgressCallback,
): Promise<Blob> {
  if (urls.length === 0) throw new Error('No videos to merge')

  const first = await loadVideo(urls[0])
  const width = Math.max(640, Math.floor(first.videoWidth || 1280))
  const height = Math.max(360, Math.floor(first.videoHeight || 720))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D not supported')

  // Initial paint so the stream has a frame
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  const fps = 30
  const stream = canvas.captureStream(fps)
  const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })
  recorder.start(250)

  let rafId = 0
  const loopPaint = (video: HTMLVideoElement) => {
    const tick = () => {
      drawContain(ctx, video, width, height)
      rafId = requestAnimationFrame(tick)
    }
    tick()
  }

  let totalDuration = 0
  for (const u of urls) {
    const v = await loadVideo(u)
    totalDuration += Number.isFinite(v.duration) ? v.duration : 0
  }

  let elapsedDuration = 0
  for (let i = 0; i < urls.length; i++) {
    const video = i === 0 ? first : await loadVideo(urls[i])
    const dur = Number.isFinite(video.duration) ? video.duration : 0

    await video.play().catch(() => {/* autoplay policy: muted should be fine */})
    loopPaint(video)

    await new Promise<void>((resolve) => {
      const onEnded = () => {
        video.removeEventListener('ended', onEnded)
        cancelAnimationFrame(rafId)
        resolve()
      }
      video.addEventListener('ended', onEnded)
    })

    elapsedDuration += dur
    onProgress?.({
      ratio: totalDuration > 0 ? Math.min(1, elapsedDuration / totalDuration) : (i + 1) / urls.length,
      clipIndex: i + 1,
      totalClips: urls.length,
    })
  }

  // Give recorder a beat to flush the last frames.
  await new Promise((r) => setTimeout(r, 250))
  recorder.stop()
  await stopped

  return new Blob(chunks, { type: 'video/webm' })
}
