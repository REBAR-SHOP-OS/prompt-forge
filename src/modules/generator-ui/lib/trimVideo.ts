// In-browser video trimming via canvas + MediaRecorder.
//
// Strategy: build the list of KEEP segments from the user's cut ranges, then
// play through each keep segment sequentially while a single MediaRecorder
// runs continuously (never paused). To avoid the "frozen chunk" artefact at
// segment boundaries we GATE the inputs to the recorder:
//   - video: canvas.captureStream(0) + track.requestFrame() called only from
//     the rAF loop while a segment is actively playing. No frames are pushed
//     during seeks, so the encoder never duplicates a static frame.
//   - audio: a GainNode sits between MediaElementSource and the stream
//     destination. Gain is ramped to 0 during seeks and back to 1 right
//     before each segment plays, so we never leak audio from paused/seeking
//     state into the output.

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

type FrameTrack = MediaStreamTrack & { requestFrame?: () => void }

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

  // Manual frame mode: we push frames ourselves via requestFrame().
  const videoStream = canvas.captureStream(0)
  const frameTrack = videoStream.getVideoTracks()[0] as FrameTrack | undefined

  // --- Audio routing -------------------------------------------------------
  const Ctor: typeof AudioContext = (window.AudioContext
    ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
  let audioCtx: AudioContext | null = null
  let audioDest: MediaStreamAudioDestinationNode | null = null
  let gainNode: GainNode | null = null
  let outStream: MediaStream = videoStream
  if (muteAudio) {
    try { video.muted = true } catch { /* noop */ }
    outStream = videoStream
  } else {
    try {
      audioCtx = new Ctor()
      audioDest = audioCtx.createMediaStreamDestination()
      const src = audioCtx.createMediaElementSource(video)
      gainNode = audioCtx.createGain()
      gainNode.gain.value = 0
      src.connect(gainNode)
      gainNode.connect(audioDest)
      outStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ])
    } catch (err) {
      console.warn('[trimVideoLocally] audio capture unavailable:', err)
      outStream = videoStream
    }
  }

  const setAudioGain = (target: number) => {
    if (!gainNode || !audioCtx) return
    try {
      gainNode.gain.setTargetAtTime(target, audioCtx.currentTime, 0.005)
    } catch {
      gainNode.gain.value = target
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
    try { frameTrack?.stop() } catch { /* noop */ }
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

  let keptSoFar = 0
  let recorderStarted = false
  try {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]

      // Seek to segment start while video is paused and audio is muted.
      // No frames are pushed to the canvas track during this time.
      try { video.pause() } catch { /* noop */ }
      setAudioGain(0)
      await seekTo(video, Math.min(duration, Math.max(0, seg.start)))
      // Pre-paint so the first requestFrame after play() has fresh content.
      drawContain(ctx, video, width, height)

      // Start recorder exactly once, right before the first segment plays.
      if (!recorderStarted) {
        recorderStarted = true
        try {
          recorder.start(250)
        } catch (e) {
          await cleanup()
          throw e as Error
        }
      }

      await new Promise<void>((resolve, reject) => {
        const segEnd = seg.end
        const segStart = seg.start
        const segDur = Math.max(0, segEnd - segStart)
        const startedAt = keptSoFar
        let done = false

        const finish = () => {
          if (done) return
          done = true
          keptSoFar = startedAt + segDur
          onProgress?.({ ratio: Math.min(1, keptSoFar / totalKept) })
          resolve()
        }

        const tick = () => {
          if (stopped || done) return
          drawContain(ctx, video, width, height)
          frameTrack?.requestFrame?.()
          const t = video.currentTime
          if (t >= segEnd - 0.01) {
            finish()
            return
          }
          const processed = Math.max(0, t - segStart)
          onProgress?.({ ratio: Math.min(1, (startedAt + processed) / totalKept) })
          rafId = requestAnimationFrame(tick)
        }

        const onEnded = () => {
          video.removeEventListener('ended', onEnded)
          finish()
        }
        video.addEventListener('ended', onEnded)

        video.play().then(() => {
          setAudioGain(1)
          rafId = requestAnimationFrame(tick)
        }).catch((e) => reject(e as Error))
      })

      // Mute audio immediately after the segment finishes so any tail
      // samples while we pause/seek do not get encoded.
      setAudioGain(0)
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
