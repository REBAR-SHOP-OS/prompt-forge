// Lightweight, in-browser WebM -> MP4 converter that does NOT depend on
// ffmpeg.wasm. It plays the source video into a hidden <video>, paints frames
// onto a canvas, captures the canvas stream + the video's audio track, and
// records it with MediaRecorder requesting an MP4 container.
//
// Why this exists: ffmpeg.wasm load/encode can hang in some browsers, leaving
// the MP4 download stuck (e.g. at 10%). Chromium-based browsers can record
// directly to `video/mp4` (H.264/AAC) via MediaRecorder, which is fast,
// progresses in real time, and produces a broadly compatible file.
//
// Returns null when MP4 recording is unsupported (e.g. Firefox) so the caller
// can fall back to ffmpeg.wasm or to the original file.

export interface RecordMp4Progress {
  /** 0..1 based on the source video playhead. */
  ratio: number
}

export function canRecordMp4(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    (MediaRecorder.isTypeSupported('video/mp4;codecs=h264,aac') ||
      MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2') ||
      MediaRecorder.isTypeSupported('video/mp4'))
  )
}

function pickMp4Mime(): string | null {
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
  ]
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return null
}

/** Force a finite duration for WebM blobs that report Infinity until seeked. */
function resolveDuration(v: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Number.isFinite(v.duration) && v.duration > 0) {
      resolve()
      return
    }
    const giveUp = setTimeout(() => {
      cleanup()
      reject(new Error('Unreadable video duration'))
    }, 8000)
    const onChange = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) {
        cleanup()
        try { v.currentTime = 0 } catch { /* ignore */ }
        resolve()
      }
    }
    const cleanup = () => {
      clearTimeout(giveUp)
      v.removeEventListener('durationchange', onChange)
      v.removeEventListener('seeked', onChange)
    }
    v.addEventListener('durationchange', onChange)
    v.addEventListener('seeked', onChange)
    try { v.currentTime = 1e7 } catch { cleanup(); reject(new Error('Unreadable video duration')) }
  })
}

/**
 * Re-record a source video blob into an MP4 blob using MediaRecorder.
 * Resolves to null when MP4 recording is not supported by this browser.
 */
export async function recordBlobToMp4(
  blob: Blob,
  onProgress?: (p: RecordMp4Progress) => void,
): Promise<Blob | null> {
  const mime = pickMp4Mime()
  if (!mime) return null

  const objectUrl = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.muted = false
  video.playsInline = true
  video.preload = 'auto'
  video.src = objectUrl

  const cleanupEls = () => {
    try { video.pause() } catch { /* ignore */ }
    try { URL.revokeObjectURL(objectUrl) } catch { /* ignore */ }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Video metadata load timed out')), 20000)
      video.onloadedmetadata = () => { clearTimeout(t); resolve() }
      video.onerror = () => { clearTimeout(t); reject(new Error('Failed to load source video')) }
    })
    await resolveDuration(video)

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    const duration = video.duration

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const fps = 30
    const canvasStream = canvas.captureStream(fps)
    const outStream = new MediaStream()
    canvasStream.getVideoTracks().forEach((tr) => outStream.addTrack(tr))

    // Pull audio from the source video via captureStream when available.
    let audioCtx: AudioContext | null = null
    try {
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
      audioCtx = new AC()
      const srcNode = audioCtx.createMediaElementSource(video)
      const dest = audioCtx.createMediaStreamDestination()
      srcNode.connect(dest)
      // Keep it silent for the user but still captured by the recorder.
      const silentGain = audioCtx.createGain()
      silentGain.gain.value = 0
      srcNode.connect(silentGain)
      silentGain.connect(audioCtx.destination)
      dest.stream.getAudioTracks().forEach((tr) => outStream.addTrack(tr))
    } catch {
      audioCtx = null
    }

    const recorder = new MediaRecorder(outStream, { mimeType: mime })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data) }

    let rafId = 0
    const draw = () => {
      try { ctx.drawImage(video, 0, 0, width, height) } catch { /* ignore */ }
      if (duration > 0 && onProgress) {
        onProgress({ ratio: Math.min(0.99, video.currentTime / duration) })
      }
      rafId = requestAnimationFrame(draw)
    }

    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })

    recorder.start(250)
    rafId = requestAnimationFrame(draw)
    try { await video.play() } catch { /* autoplay-with-gesture should already be granted */ }

    await new Promise<void>((resolve, reject) => {
      const watchdog = setTimeout(() => reject(new Error('MP4 recording timed out')), Math.max(60000, duration * 1000 * 2 + 15000))
      video.onended = () => { clearTimeout(watchdog); resolve() }
      video.onerror = () => { clearTimeout(watchdog); reject(new Error('Playback error during recording')) }
    })

    cancelAnimationFrame(rafId)
    try { recorder.stop() } catch { /* ignore */ }
    await stopped
    try { await audioCtx?.close() } catch { /* ignore */ }

    onProgress?.({ ratio: 1 })
    if (chunks.length === 0) return null
    return new Blob(chunks, { type: 'video/mp4' })
  } catch (err) {
    console.warn('[recordBlobToMp4] failed:', err)
    return null
  } finally {
    cleanupEls()
  }
}
