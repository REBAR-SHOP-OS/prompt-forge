// Re-encode a remote video to a target aspect ratio (9:16, 1:1, 16:9) by
// drawing each frame onto a canvas with the chosen ratio (object-cover crop)
// and capturing the canvas stream into a webm file. Triggers a browser
// download when finished.
//
// This guarantees the downloaded file matches the user's selected aspect
// ratio, regardless of the provider's native output dimensions.

export type DownloadRatio = '9:16' | '1:1' | '16:9'

function ratioToWH(ratio: DownloadRatio, base = 1080): { w: number; h: number } {
  switch (ratio) {
    case '9:16':
      return { w: Math.round((base * 9) / 16 / 2) * 2, h: base } // ~608x1080
    case '1:1':
      return { w: base, h: base }
    case '16:9':
    default:
      return { w: base, h: Math.round((base * 9) / 16 / 2) * 2 } // 1080x608
  }
}

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  for (const mt of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mt)) return mt
  }
  return 'video/webm'
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

async function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.preload = 'auto'
    v.muted = true
    v.playsInline = true
    v.src = src
    v.onloadedmetadata = () => resolve(v)
    v.onerror = () => reject(new Error('Failed to load video for re-encoding'))
  })
}

export async function downloadVideoAtRatio(
  src: string,
  ratio: DownloadRatio,
  filename = `clip-${ratio.replace(':', 'x')}.webm`,
): Promise<void> {
  const video = await loadVideo(src)
  const { w, h } = ratioToWH(ratio)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D not supported')

  // object-cover: scale so the source fully covers the target, then center-crop
  const drawCover = () => {
    const sw = video.videoWidth || w
    const sh = video.videoHeight || h
    const scale = Math.max(w / sw, h / sh)
    const dw = sw * scale
    const dh = sh * scale
    const dx = (w - dw) / 2
    const dy = (h - dh) / 2
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(video, dx, dy, dw, dh)
  }

  const fps = 30
  const canvasStream = canvas.captureStream(fps)

  // Try to grab an audio track from the source video.
  // deno-lint-ignore no-explicit-any
  const vAny = video as any
  let audioTracks: MediaStreamTrack[] = []
  try {
    const vStream: MediaStream | null =
      typeof vAny.captureStream === 'function'
        ? vAny.captureStream()
        : typeof vAny.mozCaptureStream === 'function'
          ? vAny.mozCaptureStream()
          : null
    if (vStream) audioTracks = vStream.getAudioTracks()
  } catch {
    /* no audio capture available */
  }
  for (const t of audioTracks) canvasStream.addTrack(t)

  const recorder = new MediaRecorder(canvasStream, { mimeType: pickMimeType() })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })

  let stop = false
  const tick = () => {
    if (stop) return
    drawCover()
    requestAnimationFrame(tick)
  }

  recorder.start(250)
  tick()

  video.currentTime = 0
  await video.play()

  await new Promise<void>((resolve) => {
    video.onended = () => resolve()
  })

  stop = true
  await new Promise((r) => setTimeout(r, 120))
  recorder.stop()
  await stopped

  const blob = new Blob(chunks, { type: 'video/webm' })
  triggerDownload(blob, filename)
}
