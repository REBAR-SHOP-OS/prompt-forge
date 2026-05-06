// In-browser video concatenation via canvas + MediaRecorder.
//
// - Sequentially plays each source URL into a hidden <video>, paints frames
//   onto a shared <canvas>, and captures the canvas stream.
// - Always emits a real audio track in the recorded MediaStream:
//     * If a soundtrack is provided, the recorded audio = the soundtrack
//       (clip audio is muted).
//     * Otherwise, the recorded audio = each clip's own audio in turn.
// - Prefers MP4 (H.264 + AAC) when the browser's MediaRecorder supports it,
//   so the downloaded file plays in QuickTime / VLC / mobile players /
//   editors. Falls back to WebM/Opus on browsers that can only record WebM.

export interface MergeProgress {
  /** 0..1 overall progress estimate. */
  ratio: number
  /** 1-based index of the clip currently being processed. */
  clipIndex: number
  totalClips: number
}

export type MergeProgressCallback = (p: MergeProgress) => void

export interface MergeAudioOptions {
  /** Object URL or remote URL of the audio file to use as soundtrack. */
  src: string
  /** Inclusive start offset in seconds within the audio file. */
  startSec: number
  /** Exclusive end offset in seconds within the audio file. */
  endSec: number
}

export interface MergeResult {
  blob: Blob
  mimeType: string
  extension: 'mp4' | 'webm'
}

function pickMimeType(): string {
  // Prefer MP4 (H.264 + AAC) so the downloaded file plays everywhere.
  // Recent Chromium (>=130) and Safari (>=14.1) support recording MP4 directly.
  // Fall back to WebM (VP9/VP8 + Opus) on browsers that don't.
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=opus',
    'video/webm',
  ]
  for (const mt of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mt)) {
      return mt
    }
  }
  return 'video/webm'
}

export function mimeTypeToExtension(mimeType: string): 'mp4' | 'webm' {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
}

async function loadVideo(url: string, withAudio: boolean): Promise<HTMLVideoElement> {
  return await new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.preload = 'auto'
    // When audio is being captured via Web Audio, the element MUST not be
    // muted (muted hides the audio from createMediaElementSource too).
    v.muted = !withAudio
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
): Promise<MergeResult> {
  if (urls.length === 0) throw new Error('No videos to merge')

  const useSoundtrack = Boolean(audio && audio.endSec > audio.startSec)
  // When a soundtrack is set, clip audio is intentionally muted.
  const captureClipAudio = !useSoundtrack

  const first = await loadVideo(urls[0], captureClipAudio)
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

  // --- Audio routing -------------------------------------------------------
  // Always create an AudioContext + destination so the recorded MediaStream
  // always carries a real audio track. This avoids "no audio track" files
  // that some players (and the user) interpret as broken audio.
  const Ctor: typeof AudioContext = (window.AudioContext
    ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
  let audioCtx: AudioContext | null = null
  let audioDest: MediaStreamAudioDestinationNode | null = null
  let outStream: MediaStream = videoStream

  try {
    audioCtx = new Ctor()
    audioDest = audioCtx.createMediaStreamDestination()
    const tracks = [...videoStream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]
    outStream = new MediaStream(tracks)
  } catch (err) {
    console.warn('[mergeVideoUrls] AudioContext unavailable, recording video-only:', err)
    audioCtx = null
    audioDest = null
    outStream = videoStream
  }

  // --- Optional soundtrack: connect a single <audio> to the destination.
  let soundtrackEl: HTMLAudioElement | null = null
  let soundtrackTimeListener: (() => void) | null = null
  if (useSoundtrack && audio && audioCtx && audioDest) {
    try {
      soundtrackEl = document.createElement('audio')
      soundtrackEl.crossOrigin = 'anonymous'
      soundtrackEl.src = audio.src
      soundtrackEl.preload = 'auto'
      soundtrackEl.loop = true
      await new Promise<void>((resolve, reject) => {
        const onReady = () => { soundtrackEl!.removeEventListener('loadedmetadata', onReady); resolve() }
        const onErr = () => { soundtrackEl!.removeEventListener('error', onErr); reject(new Error('Failed to load soundtrack')) }
        soundtrackEl!.addEventListener('loadedmetadata', onReady)
        soundtrackEl!.addEventListener('error', onErr)
      })
      soundtrackEl.currentTime = Math.max(0, audio.startSec)
      const source = audioCtx.createMediaElementSource(soundtrackEl)
      source.connect(audioDest)
    } catch (err) {
      console.warn('[mergeVideoUrls] soundtrack disabled:', err)
      soundtrackEl = null
    }
  }

  const chosenMime = pickMimeType()
  const recorder = new MediaRecorder(outStream, { mimeType: chosenMime })
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
  if (soundtrackEl && audio) {
    const winStart = Math.max(0, audio.startSec)
    const winEnd = Math.max(winStart + 0.05, audio.endSec)
    soundtrackTimeListener = () => {
      if (!soundtrackEl) return
      if (soundtrackEl.currentTime >= winEnd) {
        soundtrackEl.currentTime = winStart
      }
    }
    soundtrackEl.addEventListener('timeupdate', soundtrackTimeListener)
    try { await soundtrackEl.play() } catch { /* ignore autoplay reject */ }
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
    const v = await loadVideo(u, false)
    totalDuration += Number.isFinite(v.duration) ? v.duration : 0
  }

  let elapsedDuration = 0
  for (let i = 0; i < urls.length; i++) {
    const video = i === 0 ? first : await loadVideo(urls[i], captureClipAudio)
    const dur = Number.isFinite(video.duration) ? video.duration : 0

    // Wire this clip's audio into the shared destination, unless a soundtrack
    // is active. createMediaElementSource detaches the element from the
    // default speakers so the user hears nothing during render.
    let clipNode: MediaElementAudioSourceNode | null = null
    if (captureClipAudio && audioCtx && audioDest) {
      try {
        clipNode = audioCtx.createMediaElementSource(video)
        clipNode.connect(audioDest)
      } catch (err) {
        // Most often a CORS issue — render the clip without audio rather than fail.
        console.warn('[mergeVideoUrls] clip audio skipped:', err)
        clipNode = null
      }
    }

    await video.play().catch(() => {/* autoplay policy */})
    loopPaint(video)

    await new Promise<void>((resolve) => {
      const onEnded = () => {
        video.removeEventListener('ended', onEnded)
        cancelAnimationFrame(rafId)
        resolve()
      }
      video.addEventListener('ended', onEnded)
    })

    if (clipNode) {
      try { clipNode.disconnect() } catch { /* ignore */ }
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

  // Tear down audio resources.
  if (soundtrackEl) {
    if (soundtrackTimeListener) soundtrackEl.removeEventListener('timeupdate', soundtrackTimeListener)
    try { soundtrackEl.pause() } catch { /* ignore */ }
    soundtrackEl.src = ''
  }
  if (audioCtx) {
    try { await audioCtx.close() } catch { /* ignore */ }
  }

  const blob = new Blob(chunks, { type: chosenMime })
  return { blob, mimeType: chosenMime, extension: mimeTypeToExtension(chosenMime) }
}
