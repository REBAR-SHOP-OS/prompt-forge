// In-browser video concatenation via canvas + MediaRecorder.
// Sequentially plays each source URL into a hidden <video>, paints frames
// onto a shared <canvas>, and captures the canvas stream into one webm blob.
//
// Audio is preserved by routing each clip's <video> element through a shared
// WebAudio graph (MediaElementAudioSourceNode → MediaStreamAudioDestinationNode)
// and merging that audio track with the canvas video track into a single
// MediaStream that feeds the MediaRecorder.
//
// Notes:
//  - All sources are normalized to the dimensions of the FIRST clip; later
//    clips are letterboxed (object-fit: contain) onto that canvas.
//  - Clips without an audio track simply produce silence for their duration.

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

interface LoadedVideo {
  el: HTMLVideoElement
  source: MediaElementAudioSourceNode | null
}

async function loadVideo(
  url: string,
  audioCtx: AudioContext,
  audioDest: MediaStreamAudioDestinationNode,
): Promise<LoadedVideo> {
  return await new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.preload = 'auto'
    // Keep element muted so it doesn't double-play through the speakers;
    // WebAudio's MediaElementSource still receives the audio buffer in all
    // major browsers even when the element is muted.
    v.muted = true
    v.playsInline = true
    v.src = url
    v.onloadedmetadata = () => {
      let source: MediaElementAudioSourceNode | null = null
      try {
        source = audioCtx.createMediaElementSource(v)
        source.connect(audioDest)
      } catch {
        // Element may not have audio, or source already created — ignore.
        source = null
      }
      resolve({ el: v, source })
    }
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

  const AudioCtxCtor: typeof AudioContext =
    (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const audioCtx = new AudioCtxCtor()
  if (audioCtx.state === 'suspended') {
    try { await audioCtx.resume() } catch { /* ignore */ }
  }
  const audioDest = audioCtx.createMediaStreamDestination()

  const first = await loadVideo(urls[0], audioCtx, audioDest)
  const width = Math.max(640, Math.floor(first.el.videoWidth || 1280))
  const height = Math.max(360, Math.floor(first.el.videoHeight || 720))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D not supported')

  // Initial paint so the stream has a frame
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  const fps = 30
  const videoStream = canvas.captureStream(fps)
  // Combine canvas video track with mixed audio track from WebAudio.
  const combined = new MediaStream()
  videoStream.getVideoTracks().forEach((t) => combined.addTrack(t))
  audioDest.stream.getAudioTracks().forEach((t) => combined.addTrack(t))

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

  // Pre-load all clips so we know total duration AND so each element gets its
  // MediaElementSource attached before playback starts.
  const loaded: LoadedVideo[] = [first]
  for (let i = 1; i < urls.length; i++) {
    loaded.push(await loadVideo(urls[i], audioCtx, audioDest))
  }
  let totalDuration = 0
  for (const v of loaded) {
    totalDuration += Number.isFinite(v.el.duration) ? v.el.duration : 0
  }

  let elapsedDuration = 0
  for (let i = 0; i < loaded.length; i++) {
    const { el: video } = loaded[i]
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

  // Give recorder a beat to flush the last frames/audio samples.
  await new Promise((r) => setTimeout(r, 300))
  recorder.stop()
  await stopped

  // Cleanup audio graph.
  try {
    for (const v of loaded) {
      try { v.source?.disconnect() } catch { /* ignore */ }
    }
    await audioCtx.close()
  } catch { /* ignore */ }

  return new Blob(chunks, { type: 'video/webm' })
}
