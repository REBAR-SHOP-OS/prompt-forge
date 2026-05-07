// In-browser video concatenation via canvas + MediaRecorder.
//
// - Sequentially plays each source URL into a hidden <video>, paints frames
//   onto a shared <canvas>, and captures the canvas stream.
// - Always emits a real audio track in the recorded MediaStream.
// - Supports per-gap transitions (cut/fade/crossfade/slide/wipe/zoom) painted
//   on the canvas during a short overlap between the outgoing and incoming
//   clip.
// - Prefers MP4 (H.264 + AAC) when supported, falls back to WebM/Opus.

export interface MergeProgress {
  ratio: number
  clipIndex: number
  totalClips: number
}

export type MergeProgressCallback = (p: MergeProgress) => void

export interface MergeAudioOptions {
  src: string
  startSec: number
  endSec: number
  /** 0..1, default 1 */
  musicVolume?: number
  /** 0..1, default 0 (music-only). Set >0 to mix clip audio in. */
  clipVolume?: number
}

export type TransitionId =
  | 'cut'
  | 'fade'
  | 'crossfade'
  | 'slide-left'
  | 'slide-right'
  | 'wipe'
  | 'zoom'

export interface TransitionSpec {
  id: TransitionId
  durationMs: number
}

export interface MergeResult {
  blob: Blob
  mimeType: string
  extension: 'mp4' | 'webm'
}

function pickMimeType(): string {
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

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/**
 * Paint a single transition frame composed of the outgoing snapshot (canvas
 * with last frame of clip A) and the incoming live video (clip B).
 */
function paintTransitionFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  outgoing: HTMLCanvasElement,
  incoming: HTMLVideoElement,
  spec: TransitionSpec,
  t: number,
) {
  const e = easeInOut(t)

  const drawIncoming = () => drawContain(ctx, incoming, width, height)
  const drawOutgoing = () => {
    ctx.drawImage(outgoing, 0, 0, width, height)
  }

  switch (spec.id) {
    case 'fade': {
      // Out fades to black, then in fades from black.
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
      if (t < 0.5) {
        ctx.globalAlpha = 1 - t * 2
        drawOutgoing()
      } else {
        ctx.globalAlpha = (t - 0.5) * 2
        drawIncoming()
      }
      ctx.globalAlpha = 1
      return
    }
    case 'crossfade': {
      drawOutgoing()
      ctx.globalAlpha = e
      drawIncoming()
      ctx.globalAlpha = 1
      return
    }
    case 'slide-left': {
      // Incoming slides in from the right.
      const dx = Math.round(width * (1 - e))
      ctx.save()
      ctx.translate(-Math.round(width * e), 0)
      drawOutgoing()
      ctx.restore()
      ctx.save()
      ctx.translate(dx, 0)
      drawIncoming()
      ctx.restore()
      return
    }
    case 'slide-right': {
      const dx = Math.round(-width * (1 - e))
      ctx.save()
      ctx.translate(Math.round(width * e), 0)
      drawOutgoing()
      ctx.restore()
      ctx.save()
      ctx.translate(dx, 0)
      drawIncoming()
      ctx.restore()
      return
    }
    case 'wipe': {
      // Incoming revealed by a vertical edge moving left → right.
      drawOutgoing()
      const w = Math.round(width * e)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, w, height)
      ctx.clip()
      drawIncoming()
      ctx.restore()
      return
    }
    case 'zoom': {
      // Outgoing scales up + fades out, incoming scales in from 0.9.
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
      // Outgoing
      ctx.save()
      const sOut = 1 + 0.2 * e
      ctx.translate(width / 2, height / 2)
      ctx.scale(sOut, sOut)
      ctx.translate(-width / 2, -height / 2)
      ctx.globalAlpha = 1 - e
      drawOutgoing()
      ctx.restore()
      // Incoming
      ctx.save()
      const sIn = 0.9 + 0.1 * e
      ctx.translate(width / 2, height / 2)
      ctx.scale(sIn, sIn)
      ctx.translate(-width / 2, -height / 2)
      ctx.globalAlpha = e
      drawIncoming()
      ctx.restore()
      ctx.globalAlpha = 1
      return
    }
    case 'cut':
    default: {
      drawIncoming()
      return
    }
  }
}

export async function mergeVideoUrls(
  urls: string[],
  onProgress?: MergeProgressCallback,
  audio?: MergeAudioOptions,
  transitions?: TransitionSpec[],
): Promise<MergeResult> {
  if (urls.length === 0) throw new Error('No videos to merge')

  const useSoundtrack = Boolean(audio && audio.endSec > audio.startSec)
  const musicVolume = Math.max(0, Math.min(1, audio?.musicVolume ?? 1))
  // When no soundtrack is used, default to capturing full clip audio.
  // When soundtrack is used, default to 0 (music-only) unless caller opts in.
  const clipVolume = Math.max(0, Math.min(1, audio?.clipVolume ?? (useSoundtrack ? 0 : 1)))
  const captureClipAudio = clipVolume > 0

  const first = await loadVideo(urls[0], captureClipAudio)
  const width = Math.max(640, Math.floor(first.videoWidth || 1280))
  const height = Math.max(360, Math.floor(first.videoHeight || 720))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D not supported')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  // Offscreen canvas used to snapshot the last frame of each outgoing clip.
  const snapshot = document.createElement('canvas')
  snapshot.width = width
  snapshot.height = height
  const snapCtx = snapshot.getContext('2d')
  if (!snapCtx) throw new Error('Canvas 2D not supported (snapshot)')

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
    const tracks = [...videoStream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]
    outStream = new MediaStream(tracks)
  } catch (err) {
    console.warn('[mergeVideoUrls] AudioContext unavailable, recording video-only:', err)
    audioCtx = null
    audioDest = null
    outStream = videoStream
  }

  let soundtrackEl: HTMLAudioElement | null = null
  let soundtrackEndedHandler: (() => void) | null = null
  let soundtrackClampRaf = 0
  if (useSoundtrack && audio && audioCtx && audioDest) {
    try {
      soundtrackEl = document.createElement('audio')
      soundtrackEl.crossOrigin = 'anonymous'
      soundtrackEl.src = audio.src
      soundtrackEl.preload = 'auto'
      // We handle looping manually so we always wrap to winStart, never to 0.
      soundtrackEl.loop = false
      await new Promise<void>((resolve, reject) => {
        const onReady = () => { soundtrackEl!.removeEventListener('loadedmetadata', onReady); resolve() }
        const onErr = () => { soundtrackEl!.removeEventListener('error', onErr); reject(new Error('Failed to load soundtrack')) }
        soundtrackEl!.addEventListener('loadedmetadata', onReady)
        soundtrackEl!.addEventListener('error', onErr)
      })
      soundtrackEl.currentTime = Math.max(0, audio.startSec)
      const source = audioCtx.createMediaElementSource(soundtrackEl)
      const gain = audioCtx.createGain()
      gain.gain.value = musicVolume
      source.connect(gain)
      gain.connect(audioDest)
    } catch (err) {
      console.warn('[mergeVideoUrls] soundtrack disabled:', err)
      soundtrackEl = null
    }
  }

  let rafId = 0
  const loopPaint = (video: HTMLVideoElement) => {
    const tick = () => {
      drawContain(ctx, video, width, height)
      rafId = requestAnimationFrame(tick)
    }
    tick()
  }

  /**
   * Resolve when the given video reaches the end. Attaches the listener
   * synchronously and short-circuits if `ended` is already true (avoids the
   * race where the event fired before this listener could be attached).
   * Also includes a safety timeout based on remaining duration so a missed
   * `ended` event can never hang the merge loop forever.
   */
  function whenEnded(video: HTMLVideoElement): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        video.removeEventListener('ended', onEnded)
        if (timer) clearTimeout(timer)
        cancelAnimationFrame(rafId)
        resolve()
      }
      const onEnded = () => finish()
      if (video.ended) { finish(); return }
      video.addEventListener('ended', onEnded)
      const dur = Number.isFinite(video.duration) ? video.duration : 0
      const remaining = Math.max(0, dur - (video.currentTime || 0))
      // +1500ms slack for decode/event dispatch latency. Minimum 3s so very
      // short clips still get a real chance to fire `ended`.
      const timeoutMs = Math.max(3000, Math.ceil(remaining * 1000) + 1500)
      const timer = setTimeout(() => {
        if (!done) {
          console.warn('[mergeVideoUrls] ended event missed; advancing via timeout')
          finish()
        }
      }, timeoutMs)
    })
  }

  // Pre-load ALL clips before starting the recorder. This avoids capturing
  // black frames at the start while videos are still being fetched/decoded,
  // and removes inter-clip loading gaps.
  const preloaded: HTMLVideoElement[] = [first]
  for (let i = 1; i < urls.length; i++) {
    preloaded.push(await loadVideo(urls[i], captureClipAudio))
  }
  let totalDuration = 0
  for (const v of preloaded) {
    totalDuration += Number.isFinite(v.duration) ? v.duration : 0
  }

  // Paint the very first frame onto the canvas BEFORE the recorder starts so
  // the captured stream begins on real content (not a black fill).
  await new Promise<void>((resolve) => {
    const onSeeked = () => {
      first.removeEventListener('seeked', onSeeked)
      drawContain(ctx, first, width, height)
      resolve()
    }
    first.addEventListener('seeked', onSeeked)
    try {
      first.currentTime = 0
    } catch {
      // Some browsers throw if currentTime is set before metadata; fall back.
      first.removeEventListener('seeked', onSeeked)
      drawContain(ctx, first, width, height)
      resolve()
    }
  })

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

  if (soundtrackEl && audio) {
    const winStart = Math.max(0, audio.startSec)
    const winEnd = Math.max(winStart + 0.05, audio.endSec)
    // Re-seek immediately before play() — some browsers reset currentTime
    // while the element is idle, which would otherwise leak the unselected
    // intro of the file into the recording.
    try { soundtrackEl.currentTime = winStart } catch { /* ignore */ }
    // rAF clamp loop: snap back to winStart the instant currentTime crosses
    // winEnd. This is much tighter than 'timeupdate' (~250ms granularity)
    // and guarantees nothing past winEnd is captured.
    const clampTick = () => {
      if (!soundtrackEl) return
      if (soundtrackEl.currentTime >= winEnd) {
        try { soundtrackEl.currentTime = winStart } catch { /* ignore */ }
      }
      soundtrackClampRaf = requestAnimationFrame(clampTick)
    }
    soundtrackClampRaf = requestAnimationFrame(clampTick)
    // If the file's natural end is reached before winEnd (shouldn't happen
    // given the clamp above, but defensive), wrap to winStart and resume.
    soundtrackEndedHandler = () => {
      if (!soundtrackEl) return
      try { soundtrackEl.currentTime = winStart } catch { /* ignore */ }
      void soundtrackEl.play().catch(() => { /* ignore */ })
    }
    soundtrackEl.addEventListener('ended', soundtrackEndedHandler)
    try { await soundtrackEl.play() } catch { /* ignore autoplay reject */ }
  }

  let elapsedDuration = 0
  let prevVideo: HTMLVideoElement | null = null
  let prevClipNode: MediaElementAudioSourceNode | null = null

  for (let i = 0; i < urls.length; i++) {
    const video = preloaded[i]
    const dur = Number.isFinite(video.duration) ? video.duration : 0

    let clipNode: MediaElementAudioSourceNode | null = null
    if (captureClipAudio && audioCtx && audioDest) {
      try {
        clipNode = audioCtx.createMediaElementSource(video)
        const gain = audioCtx.createGain()
        gain.gain.value = clipVolume
        clipNode.connect(gain)
        gain.connect(audioDest)
      } catch (err) {
        console.warn('[mergeVideoUrls] clip audio skipped:', err)
        clipNode = null
      }
    }

    // Transition INTO this clip from the previous one.
    if (i > 0 && prevVideo) {
      const spec = transitions?.[i - 1] ?? { id: 'cut' as TransitionId, durationMs: 0 }
      if (spec.id !== 'cut' && spec.durationMs > 0) {
        // Snapshot the last frame of the outgoing clip.
        snapCtx.fillStyle = '#000'
        snapCtx.fillRect(0, 0, width, height)
        drawContain(snapCtx, prevVideo, width, height)

        // Begin playing the incoming clip muted-of-RAF; we paint the blended frame manually.
        cancelAnimationFrame(rafId)
        // IMPORTANT: register the `ended` listener BEFORE play() so we never
        // miss the event if it fires during/just after the transition.
        const endedPromise = whenEnded(video)
        try {
          await video.play()
        } catch (err) {
          console.warn('[mergeVideoUrls] play() rejected for clip', i, err)
        }

        const start = performance.now()
        await new Promise<void>((resolve) => {
          const tick = () => {
            const now = performance.now()
            const t = Math.min(1, (now - start) / spec.durationMs)
            paintTransitionFrame(ctx, width, height, snapshot, video, spec, t)
            // Stop early if the incoming clip has already ended (very short clip).
            if (t >= 1 || video.ended) {
              resolve()
              return
            }
            rafId = requestAnimationFrame(tick)
          }
          rafId = requestAnimationFrame(tick)
        })

        // Disconnect previous clip's audio now that the transition is over.
        if (prevClipNode) {
          try { prevClipNode.disconnect() } catch { /* ignore */ }
          prevClipNode = null
        }

        // Continue painting the incoming clip from now on.
        loopPaint(video)
        await endedPromise
      } else {
        // Cut: behave like before.
        if (prevClipNode) {
          try { prevClipNode.disconnect() } catch { /* ignore */ }
          prevClipNode = null
        }
        const endedPromise = whenEnded(video)
        try {
          await video.play()
        } catch (err) {
          console.warn('[mergeVideoUrls] play() rejected for clip', i, err)
        }
        loopPaint(video)
        await endedPromise
      }
    } else {
      // First clip — no transition in.
      const endedPromise = whenEnded(video)
      try {
        await video.play()
      } catch (err) {
        console.warn('[mergeVideoUrls] play() rejected for first clip', err)
      }
      loopPaint(video)
      await endedPromise
    }

    elapsedDuration += dur
    onProgress?.({
      ratio: totalDuration > 0 ? Math.min(1, elapsedDuration / totalDuration) : (i + 1) / urls.length,
      clipIndex: i + 1,
      totalClips: urls.length,
    })

    prevVideo = video
    prevClipNode = clipNode
  }

  // Cleanup tail
  if (prevClipNode) {
    try { prevClipNode.disconnect() } catch { /* ignore */ }
  }

  await new Promise((r) => setTimeout(r, 250))
  recorder.stop()
  await stopped

  if (soundtrackEl) {
    if (soundtrackClampRaf) cancelAnimationFrame(soundtrackClampRaf)
    if (soundtrackEndedHandler) soundtrackEl.removeEventListener('ended', soundtrackEndedHandler)
    try { soundtrackEl.pause() } catch { /* ignore */ }
    soundtrackEl.src = ''
  }
  if (audioCtx) {
    try { await audioCtx.close() } catch { /* ignore */ }
  }

  const blob = new Blob(chunks, { type: chosenMime })
  return { blob, mimeType: chosenMime, extension: mimeTypeToExtension(chosenMime) }
}
