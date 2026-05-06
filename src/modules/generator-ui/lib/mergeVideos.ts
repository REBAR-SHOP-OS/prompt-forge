// In-browser video concatenation via canvas + MediaRecorder.
// Sequentially plays each source URL into a hidden <video>, paints frames
// onto a shared <canvas>, and captures the canvas stream into one webm blob.
//
// Audio: each clip's audio track is routed through a shared AudioContext
// MediaStreamDestination and muxed into the recorded MediaStream alongside
// the canvas video track. Clips without audio (e.g. still-image clips)
// produce silence for their duration, which is the desired behavior.
//
// Notes:
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

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
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

async function loadVideo(url: string): Promise<HTMLVideoElement> {
  return await new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.preload = 'auto'
    // Keep playback silent for the user, but the audio track is captured
    // through AudioContext (independent of element playback gain).
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
  const canvasStream = canvas.captureStream(fps)

  // Shared audio graph: one AudioContext + one MediaStreamDestination feeds
  // the recorder. For each clip we attach a MediaElementAudioSourceNode for
  // that clip's <video> element. createMediaElementSource can only be called
  // once per element, but each clip uses a fresh element so this is fine.
  const AudioCtor: typeof AudioContext | undefined =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  const audioCtx = AudioCtor ? new AudioCtor() : null
  const audioDest = audioCtx ? audioCtx.createMediaStreamDestination() : null

  // Combined output stream: canvas video track + (optional) shared audio track.
  const combined = new MediaStream()
  for (const t of canvasStream.getVideoTracks()) combined.addTrack(t)
  if (audioDest) {
    for (const t of audioDest.stream.getAudioTracks()) combined.addTrack(t)
  }

  const recorder = new MediaRecorder(combined, { mimeType: pickMimeType() })
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

    // Wire this clip's audio (if any) into the shared destination. Wrap in
    // try/catch because some clips (still-image webms) have no audio track,
    // and createMediaElementSource can throw on cross-origin without CORS.
    let srcNode: MediaElementAudioSourceNode | null = null
    if (audioCtx && audioDest) {
      try {
        srcNode = audioCtx.createMediaElementSource(video)
        srcNode.connect(audioDest)
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {/* ignore */})
        }
      } catch {
        srcNode = null
      }
    }

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

    // Disconnect this clip's audio so it doesn't leak into the next clip's window.
    if (srcNode) {
      try { srcNode.disconnect() } catch { /* ignore */ }
    }

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

  if (audioCtx) {
    try { await audioCtx.close() } catch { /* ignore */ }
  }

  return new Blob(chunks, { type: 'video/webm' })
}
