// In-browser video trimming via canvas + MediaRecorder.
//
// Strategy: build the list of KEEP segments from the user's cut ranges, then
// play through each keep segment sequentially while a single MediaRecorder
// runs continuously (never paused). Between segments we pause the <video>
// element and seek to the next keep-start; the recorder keeps running, but
// since the video (and therefore the audio source) is paused, only the
// seek-duration appears as a tiny inter-segment glue frame instead of the
// large "frozen" chunks that MediaRecorder.pause()/resume() used to produce
// with canvas.captureStream + MediaElementSource in Chrome.

export interface CutRange {
  /** seconds, inclusive start */
  start: number
  /** seconds, exclusive end */
  end: number
}

export interface TrimProgress {
  /** 0..1 — based on kept-time processed so far */
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

/** Build [start,end] keep segments from normalized cuts. */
function keepSegments(cuts: CutRange[], duration: number): Array<{ start: number; end: number }> {
  const segs: Array<{ start: number; end: number }> = []
  let cursor = 0
  for (const c of cuts) {
    if (c.start > cursor + 0.02) segs.push({ start: cursor, end: c.start })
    cursor = Math.max(cursor, c.end)
  }
  if (duration > cursor + 0.02) segs.push({ start: cursor, end: duration })
  return segs
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

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    try {
      video.currentTime = t
    } catch {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
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
  const segments = norm.length === 0
    ? [{ start: 0, end: duration }]
    : keepSegments(norm, duration)
  if (segments.length === 0) throw new Error('Nothing to keep after applying cuts.')

  const totalKept = segments.reduce((s, x) => s + (x.end - x.start), 0)

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
  if (muteAudio) {
    try { video.muted = true } catch { /* noop */ }
    outStream = videoStream
  } else {
    try {
      audioCtx = new Ctor()
      audioDest = audioCtx.createMediaStreamDestination()
      const src = audioCtx.createMediaElementSource(video)
      src.connect(audioDest)
      outStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ])
    } catch (err) {
      console.warn('[trimVideoLocally] audio capture unavailable:', err)
      outStream = videoStream
    }
  }

  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(outStream, { mimeType, videoBitsPerSecond: 5_000_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunks.push(ev.data) }

  let stopped = false
  let rafId = 0

  const cleanup = async () => {
    cancelAnimationFrame(rafId)
    try { video.pause() } catch { /* noop */ }
    video.removeAttribute('src')
    video.load()
    try { await audioCtx?.close() } catch { /* noop */ }
  }

  const stopRecorder = () => {
    if (stopped) return
    stopped = true
    try { recorder.stop() } catch { /* noop */ }
  }

  const recordedBlob = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType })
      cleanup().finally(() => resolve(blob))
    }
    recorder.onerror = (ev) => {
      cleanup().finally(() => reject((ev as unknown as { error?: Error }).error ?? new Error('Recorder error')))
    }
  })

  try {
    recorder.start(250)
  } catch (e) {
    await cleanup()
    throw e as Error
  }

  let keptSoFar = 0
  try {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]

      // Seek to segment start while video is paused. Recorder keeps running
      // but no fresh frames are drawn — canvas holds the last good frame,
      // and audio source is silent because the media element is paused.
      try { video.pause() } catch { /* noop */ }
      await seekTo(video, Math.min(duration, Math.max(0, seg.start)))
      // Paint the first frame of this segment immediately so the inter-
      // segment "glue" frame on the canvas is already the next segment,
      // not the tail of the previous one.
      drawContain(ctx, video, width, height)

      await new Promise<void>((resolve, reject) => {
        const segEnd = seg.end
        const segStart = seg.start
        const segDur = Math.max(0, segEnd - segStart)
        const startedAt = keptSoFar

        const tick = () => {
          if (stopped) { resolve(); return }
          drawContain(ctx, video, width, height)
          const t = video.currentTime
          if (t >= segEnd - 0.01) {
            keptSoFar = startedAt + segDur
            onProgress?.({ ratio: Math.min(1, keptSoFar / totalKept) })
            resolve()
            return
          }
          const processed = Math.max(0, t - segStart)
          onProgress?.({ ratio: Math.min(1, (startedAt + processed) / totalKept) })
          rafId = requestAnimationFrame(tick)
        }

        const onEnded = () => {
          video.removeEventListener('ended', onEnded)
          keptSoFar = startedAt + segDur
          resolve()
        }
        video.addEventListener('ended', onEnded)

        video.play().then(() => {
          rafId = requestAnimationFrame(tick)
        }).catch((e) => reject(e as Error))
      })
    }
  } finally {
    stopRecorder()
  }

  const finalBlob = await recordedBlob
  return {
    blob: finalBlob,
    mimeType,
    extension: mimeTypeToExtension(mimeType),
    duration: totalKept,
  }
}
