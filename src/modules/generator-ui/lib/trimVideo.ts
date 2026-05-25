// In-browser video trimming via HTMLVideoElement.captureStream + MediaRecorder.
//
// Strategy (deterministic, no freezes, no slow-motion):
//   1. Build the list of KEEP segments from the user's cut ranges.
//   2. Capture a MediaStream directly from the <video> element (video + audio
//      stay perfectly in sync because they come from the same source).
//   3. For each segment: seek (while the recorder is PAUSED so seek dead-time
//      is never encoded), then resume() and play() through the segment, then
//      pause() the recorder again before the next seek.
//
// Why this fixes both bugs:
//   - Freeze on cut boundaries: previously the recorder kept its wall-clock
//     running during seeks and duplicated the last frame. Now the recorder is
//     paused while the source seeks, so no dead-time is baked into output.
//   - Slow-motion / wrong length: previously some segments were encoded with
//     extra padding (seek + first-frame-paint delay). With MediaRecorder.pause
//     the output wall-clock equals the sum of actual playback durations, so
//     the result length matches `totalKept` and runs at natural speed.
//
// This avoids the captureStream(0) + requestFrame() path, which is brittle
// because it requires the rAF loop to match wall-clock perfectly — any main-
// thread hiccup leaves the encoder starved and freezes a frame.

export interface CutRange {
  /** seconds, inclusive start */
  start: number
  /** seconds, exclusive end */
  end: number
}

export interface TrimProgress {
  /** 0..1 — overall progress including encode stage. */
  ratio: number
  /** Optional human label of current phase. */
  stage?: string
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

async function loadVideo(url: string): Promise<HTMLVideoElement> {
  return await new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.preload = 'auto'
    v.muted = false
    v.playsInline = true
    v.src = url
    const onReady = () => {
      v.removeEventListener('loadedmetadata', onReady)
      v.removeEventListener('canplay', onReady)
      resolve(v)
    }
    v.addEventListener('loadedmetadata', onReady)
    v.addEventListener('canplay', onReady)
    v.onerror = () => reject(new Error(`Failed to load video: ${url}`))
  })
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const target = Math.max(0, Math.min(video.duration || t, t))
    if (Math.abs(video.currentTime - target) < 0.005) {
      resolve()
      return
    }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    try {
      video.currentTime = target
    } catch {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
  })
}

function waitForRecorderState(
  recorder: MediaRecorder,
  state: 'recording' | 'paused',
  timeoutMs = 500,
): Promise<void> {
  return new Promise((resolve) => {
    if (recorder.state === state) {
      resolve()
      return
    }
    const evt = state === 'recording' ? 'resume' : 'pause'
    let done = false
    const finish = () => {
      if (done) return
      done = true
      recorder.removeEventListener(evt, finish)
      resolve()
    }
    recorder.addEventListener(evt, finish)
    setTimeout(finish, timeoutMs)
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface CaptureCapableVideo extends HTMLVideoElement {
  captureStream?: () => MediaStream
  mozCaptureStream?: () => MediaStream
}

function captureStreamFromVideo(video: HTMLVideoElement): MediaStream {
  const v = video as CaptureCapableVideo
  if (typeof v.captureStream === 'function') return v.captureStream()
  if (typeof v.mozCaptureStream === 'function') return v.mozCaptureStream()
  throw new Error('Video.captureStream is not supported in this browser')
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

  // Apply mute to the source element. When muted, captureStream still emits
  // an audio track (silent) on some browsers; we explicitly drop it below.
  video.muted = muteAudio
  video.volume = muteAudio ? 0 : 1
  // Hidden render: keep the element off-DOM to avoid layout cost, but some
  // browsers require it in DOM for captureStream to keep producing frames.
  // We attach it invisibly to be safe.
  video.style.position = 'fixed'
  video.style.left = '-99999px'
  video.style.top = '0'
  video.style.width = '1px'
  video.style.height = '1px'
  video.style.opacity = '0'
  video.style.pointerEvents = 'none'
  document.body.appendChild(video)

  // Source stream from the <video> element — video + audio stay in sync.
  const sourceStream = captureStreamFromVideo(video)
  const videoTracks = sourceStream.getVideoTracks()
  const audioTracks = muteAudio ? [] : sourceStream.getAudioTracks()
  const outStream = new MediaStream([...videoTracks, ...audioTracks])

  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(outStream, {
    mimeType,
    videoBitsPerSecond: 5_000_000,
    audioBitsPerSecond: 128_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunks.push(ev.data) }

  let stopped = false
  const stopRecorder = () => {
    if (stopped) return
    stopped = true
    try { recorder.stop() } catch { /* noop */ }
  }

  const cleanup = () => {
    try { video.pause() } catch { /* noop */ }
    try {
      for (const t of sourceStream.getTracks()) t.stop()
    } catch { /* noop */ }
    try { video.removeAttribute('src'); video.load() } catch { /* noop */ }
    try { video.remove() } catch { /* noop */ }
  }

  const recordedBlob = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType })
      cleanup()
      resolve(blob)
    }
    recorder.onerror = (ev) => {
      cleanup()
      reject((ev as unknown as { error?: Error }).error ?? new Error('Recorder error'))
    }
  })

  // Wait until the source is actually playable (avoids first-segment stall).
  if (video.readyState < 2) {
    await new Promise<void>((resolve) => {
      const onReady = () => {
        video.removeEventListener('canplay', onReady)
        resolve()
      }
      video.addEventListener('canplay', onReady)
    })
  }

  // Pre-seek to the first segment BEFORE the recorder starts so the very
  // first encoded frame is the correct one — no startup freeze.
  await seekTo(video, segments[0].start)
  // Let the decoder paint the frame at the seek target.
  await delay(50)

  let keptSoFar = 0
  try {
    recorder.start(250)
    // Yield once so the recorder transitions into "recording" state.
    await waitForRecorderState(recorder, 'recording', 250)

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      if (i > 0) {
        // Pause the recorder, seek to the next segment, then resume. The seek
        // dead-time is NEVER encoded, so cuts feel instant and no frame is
        // duplicated at the boundary.
        try { recorder.pause() } catch { /* noop */ }
        await waitForRecorderState(recorder, 'paused', 250)
        try { video.pause() } catch { /* noop */ }
        await seekTo(video, seg.start)
        // Give the decoder a tick to surface the new frame before we resume,
        // so the first encoded frame after resume is the correct one.
        await delay(40)
        try { recorder.resume() } catch { /* noop */ }
        await waitForRecorderState(recorder, 'recording', 250)
      }

      // Play this segment in real-time. Recorder records exactly (seg.end -
      // seg.start) seconds of wall-clock — no slow-motion possible.
      const startedAt = keptSoFar
      const segDur = Math.max(0, seg.end - seg.start)

      await new Promise<void>((resolve, reject) => {
        let done = false
        let rafId = 0

        const finish = () => {
          if (done) return
          done = true
          cancelAnimationFrame(rafId)
          video.removeEventListener('ended', onEnded)
          video.removeEventListener('error', onError)
          keptSoFar = startedAt + segDur
          onProgress?.({ ratio: Math.min(0.5, (keptSoFar / totalKept) * 0.5), stage: 'Recording' })
          resolve()
        }

        const tick = () => {
          if (done) return
          const t = video.currentTime
          if (t >= seg.end - 0.015) {
            finish()
            return
          }
          const processed = Math.max(0, t - seg.start)
          onProgress?.({ ratio: Math.min(0.5, ((startedAt + processed) / totalKept) * 0.5), stage: 'Recording' })
          rafId = requestAnimationFrame(tick)
        }

        const onEnded = () => finish()
        const onError = () => {
          done = true
          cancelAnimationFrame(rafId)
          reject(new Error('Video playback error during trim'))
        }
        video.addEventListener('ended', onEnded)
        video.addEventListener('error', onError)

        video.play()
          .then(() => { rafId = requestAnimationFrame(tick) })
          .catch((err) => {
            if (done) return
            done = true
            reject(err as Error)
          })
      })
    }

    // Pause first so we don't capture any tail samples after the last frame.
    try { recorder.pause() } catch { /* noop */ }
    await waitForRecorderState(recorder, 'paused', 250)
    try { video.pause() } catch { /* noop */ }
  } finally {
    stopRecorder()
  }

  const finalBlob = await recordedBlob
  // Normalize to standard MP4 so downloads/playback work everywhere.
  const { ensureMp4 } = await import('./transcodeToMp4')
  const mp4 = await ensureMp4(finalBlob, mimeType)
  return {
    blob: mp4.blob,
    mimeType: mp4.mimeType,
    extension: mp4.extension,
    duration: totalKept,
  }
}
