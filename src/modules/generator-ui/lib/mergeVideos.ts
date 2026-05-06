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
  audio?: MergeAudioOptions,
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
  const videoStream = canvas.captureStream(fps)

  // --- Optional soundtrack: route an <audio> element through Web Audio so its
  // track can be added to the recorded MediaStream. Video clip audio is muted
  // (the source <video> elements are muted), so the soundtrack is the only
  // audio in the output.
  let audioCtx: AudioContext | null = null
  let audioEl: HTMLAudioElement | null = null
  let audioStopTimer: number | null = null
  let outStream: MediaStream = videoStream

  if (audio && audio.endSec > audio.startSec) {
    try {
      audioEl = document.createElement('audio')
      audioEl.crossOrigin = 'anonymous'
      audioEl.src = audio.src
      audioEl.preload = 'auto'
      audioEl.loop = true
      await new Promise<void>((resolve, reject) => {
        const onReady = () => { audioEl!.removeEventListener('loadedmetadata', onReady); resolve() }
        const onErr = () => { audioEl!.removeEventListener('error', onErr); reject(new Error('Failed to load soundtrack')) }
        audioEl!.addEventListener('loadedmetadata', onReady)
        audioEl!.addEventListener('error', onErr)
      })
      audioEl.currentTime = Math.max(0, audio.startSec)

      const Ctor: typeof AudioContext = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
      audioCtx = new Ctor()
      const source = audioCtx.createMediaElementSource(audioEl)
      const dest = audioCtx.createMediaStreamDestination()
      source.connect(dest)
      // Also connect to speakers? No — keep render headless/silent for the user.

      const tracks = [...videoStream.getVideoTracks(), ...dest.stream.getAudioTracks()]
      outStream = new MediaStream(tracks)
    } catch (err) {
      // If audio setup fails, fall back to video-only.
      audioEl = null
      audioCtx = null
      outStream = videoStream
      console.warn('[mergeVideoUrls] soundtrack disabled:', err)
    }
  }

  const recorder = new MediaRecorder(outStream, { mimeType: pickMimeType(Boolean(audioEl)) })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })
  recorder.start(250)

  // Start the soundtrack at the same moment recording begins. Loop within the
  // selected window: when currentTime passes endSec, jump back to startSec.
  if (audioEl && audio) {
    const winStart = Math.max(0, audio.startSec)
    const winEnd = Math.max(winStart + 0.05, audio.endSec)
    const onTime = () => {
      if (!audioEl) return
      if (audioEl.currentTime >= winEnd) {
        audioEl.currentTime = winStart
      }
    }
    audioEl.addEventListener('timeupdate', onTime)
    try { await audioEl.play() } catch { /* ignore autoplay reject */ }
  }

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

  // Tear down audio resources.
  if (audioStopTimer !== null) window.clearTimeout(audioStopTimer)
  if (audioEl) {
    try { audioEl.pause() } catch { /* ignore */ }
    audioEl.src = ''
  }
  if (audioCtx) {
    try { await audioCtx.close() } catch { /* ignore */ }
  }

  return new Blob(chunks, { type: 'video/webm' })
}
