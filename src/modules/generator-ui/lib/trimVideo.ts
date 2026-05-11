// In-browser video trimming via canvas + MediaRecorder.
//
// Plays the source video into a hidden <video>, paints frames onto a canvas,
// and records the canvas + audio. When playback enters a "cut" range, the
// recorder is paused, the video seeks past the range, and recording resumes.
// Result: a single continuous clip with the marked ranges removed.

export interface CutRange {
  /** seconds, inclusive start */
  start: number
  /** seconds, exclusive end */
  end: number
}

export interface TrimProgress {
  /** 0..1 — based on source video currentTime / duration */
  ratio: number
}

export interface TrimResult {
  blob: Blob
  mimeType: string
  extension: 'mp4' | 'webm'
  duration: number
}

function pickMimeType(): string {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  for (const mt of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mt)) {
      return mt
    }
  }
  return 'video/webm'
}

export function mimeTypeToExtension(mt: string): 'mp4' | 'webm' {
  return mt.startsWith('video/mp4') ? 'mp4' : 'webm'
}

/** Sort, clamp to [0,duration], drop empties, merge overlaps. */
export function normalizeCuts(cuts: CutRange[], duration: number): CutRange[] {
  const cleaned = cuts
    .map((c) => ({
      start: Math.max(0, Math.min(duration, c.start)),
      end: Math.max(0, Math.min(duration, c.end)),
    }))
    .filter((c) => c.end - c.start > 0.05)
    .sort((a, b) => a.start - b.start)

  const merged: CutRange[] = []
  for (const c of cleaned) {
    const last = merged[merged.length - 1]
    if (last && c.start <= last.end + 0.01) {
      last.end = Math.max(last.end, c.end)
    } else {
      merged.push({ ...c })
    }
  }
  return merged
}

export function totalKeptDuration(cuts: CutRange[], duration: number): number {
  const norm = normalizeCuts(cuts, duration)
  let removed = 0
  for (const c of norm) removed += c.end - c.start
  return Math.max(0, duration - removed)
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

async function loadVideo(url: string): Promise<HTMLVideoElement> {
  return await new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.preload = 'auto'
    v.muted = false
    v.playsInline = true
    v.src = url
    v.onloadedmetadata = () => resolve(v)
    v.onerror = () => reject(new Error(`Failed to load video: ${url}`))
  })
}

export interface TrimOptions {
  onProgress?: (p: TrimProgress) => void
  /** When true, omit the audio track from the output. */
  muteAudio?: boolean
}

export async function trimVideoLocally(
  srcUrl: string,
  cuts: CutRange[],
  optionsOrProgress?: TrimOptions | ((p: TrimProgress) => void),
): Promise<TrimResult> {
  const options: TrimOptions = typeof optionsOrProgress === 'function'
    ? { onProgress: optionsOrProgress }
    : (optionsOrProgress ?? {})
  const onProgress = options.onProgress
  const muteAudio = options.muteAudio === true
  const video = await loadVideo(srcUrl)
  const duration = Number.isFinite(video.duration) ? video.duration : 0
  if (duration <= 0) throw new Error('Invalid video duration')

  const norm = normalizeCuts(cuts, duration)

  const width = Math.max(320, Math.floor(video.videoWidth || 720))
  const height = Math.max(320, Math.floor(video.videoHeight || 1280))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D not supported')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  const fps = 30
  const videoStream = canvas.captureStream(fps)

  // --- Audio routing -------------------------------------------------------
  const Ctor: typeof AudioContext = (window.AudioContext
    ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
  let audioCtx: AudioContext | null = null
  let audioDest: MediaStreamAudioDestinationNode | null = null
  let outStream: MediaStream = videoStream
  try {
    audioCtx = new Ctor()
    audioDest = audioCtx.createMediaStreamDestination()
    const src = audioCtx.createMediaElementSource(video)
    src.connect(audioDest)
    // Do NOT connect to audioCtx.destination — keeps the page silent during
    // background recording.
    outStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioDest.stream.getAudioTracks(),
    ])
  } catch (err) {
    console.warn('[trimVideoLocally] audio capture unavailable:', err)
    outStream = videoStream
  }

  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(outStream, { mimeType, videoBitsPerSecond: 5_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunks.push(ev.data) }

  let stopped = false
  let rafId = 0
  let seeking = false

  const cleanup = async () => {
    cancelAnimationFrame(rafId)
    try { video.pause() } catch { /* noop */ }
    video.removeAttribute('src')
    video.load()
    try { await audioCtx?.close() } catch { /* noop */ }
  }

  const finalBlob = await new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType })
      cleanup().finally(() => resolve(blob))
    }
    recorder.onerror = (ev) => {
      cleanup().finally(() => reject((ev as unknown as { error?: Error }).error ?? new Error('Recorder error')))
    }

    const stop = () => {
      if (stopped) return
      stopped = true
      try { recorder.stop() } catch { /* noop */ }
    }

    const tick = () => {
      if (stopped) return
      drawContain(ctx, video, width, height)

      const t = video.currentTime
      const next = norm.find((c) => t >= c.start - 0.02 && t < c.end)
      if (next && !seeking) {
        seeking = true
        try { recorder.pause() } catch { /* noop */ }
        const target = Math.min(duration, next.end + 0.001)
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked)
          seeking = false
          try { recorder.resume() } catch { /* noop */ }
        }
        video.addEventListener('seeked', onSeeked)
        try { video.currentTime = target } catch { /* noop */ }
      }

      onProgress?.({ ratio: Math.min(1, t / duration) })
      rafId = requestAnimationFrame(tick)
    }

    video.onended = () => stop()

    // Start: jump past a leading cut if present.
    const leading = norm.find((c) => c.start <= 0.05)
    const startAt = leading ? Math.min(duration, leading.end + 0.001) : 0

    const begin = () => {
      try {
        recorder.start(250)
      } catch (e) {
        reject(e as Error)
        return
      }
      video.play().then(() => {
        rafId = requestAnimationFrame(tick)
      }).catch((e) => {
        cleanup().finally(() => reject(e as Error))
      })
    }

    if (startAt > 0) {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        begin()
      }
      video.addEventListener('seeked', onSeeked)
      try { video.currentTime = startAt } catch { begin() }
    } else {
      begin()
    }
  })

  return {
    blob: finalBlob,
    mimeType,
    extension: mimeTypeToExtension(mimeType),
    duration: totalKeptDuration(norm, duration),
  }
}
