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
  drawIncoming: () => void,
  spec: TransitionSpec,
  t: number,
) {
  const e = easeInOut(t)

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

import {
  paintOverlays,
  preloadOverlayImages,
  ensureFontsLoaded,
  type ClipOverlay,
  type LoadedOverlayImages,
} from './overlays'

export type MergeClip =
  | { kind: 'video'; url: string }
  | { kind: 'image'; url: string; durationSec: number }

async function loadImage(url: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number,
) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, cw, ch)
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  if (!iw || !ih) return
  const scale = Math.min(cw / iw, ch / ih)
  const dw = iw * scale
  const dh = ih * scale
  const dx = (cw - dw) / 2
  const dy = (ch - dh) / 2
  ctx.drawImage(img, dx, dy, dw, dh)
}

export async function mergeVideoUrls(
  urls: string[],
  onProgress?: MergeProgressCallback,
  audio?: MergeAudioOptions,
  transitions?: TransitionSpec[],
  overlaysPerClip?: (ClipOverlay[] | undefined)[],
): Promise<MergeResult> {
  return mergeClips(
    urls.map((url) => ({ kind: 'video' as const, url })),
    onProgress,
    audio,
    transitions,
    overlaysPerClip,
  )
}

export async function mergeClips(
  clips: MergeClip[],
  onProgress?: MergeProgressCallback,
  audio?: MergeAudioOptions,
  transitions?: TransitionSpec[],
  overlaysPerClip?: (ClipOverlay[] | undefined)[],
): Promise<MergeResult> {
  if (clips.length === 0) throw new Error('No clips to merge')

  // Preload overlay images and fonts up front so paint is synchronous.
  const allOverlays: ClipOverlay[] = []
  for (const arr of overlaysPerClip ?? []) {
    if (arr) allOverlays.push(...arr)
  }
  const loadedOverlayImages: LoadedOverlayImages = allOverlays.length > 0
    ? await preloadOverlayImages(allOverlays)
    : new Map()
  if (allOverlays.length > 0) await ensureFontsLoaded(allOverlays)

  const useSoundtrack = Boolean(audio && audio.endSec > audio.startSec)
  const musicVolume = Math.max(0, Math.min(1, audio?.musicVolume ?? 1))
  const clipVolume = Math.max(0, Math.min(1, audio?.clipVolume ?? (useSoundtrack ? 0 : 1)))
  const captureClipAudio = clipVolume > 0

  // Pre-load every clip up front so paint+record is gap-free.
  type LoadedClip =
    | { kind: 'video'; video: HTMLVideoElement; durationSec: number }
    | { kind: 'image'; img: HTMLImageElement; durationSec: number }
  const loaded: LoadedClip[] = []
  for (const c of clips) {
    if (c.kind === 'video') {
      const v = await loadVideo(c.url, captureClipAudio)
      loaded.push({ kind: 'video', video: v, durationSec: Number.isFinite(v.duration) ? v.duration : 0 })
    } else {
      const img = await loadImage(c.url)
      loaded.push({ kind: 'image', img, durationSec: Math.max(0.5, c.durationSec) })
    }
  }

  // Determine canvas size from first video clip; fall back to first image,
  // then to 1280x720.
  let width = 1280
  let height = 720
  const firstVideo = loaded.find((l): l is Extract<LoadedClip, { kind: 'video' }> => l.kind === 'video')
  if (firstVideo) {
    width = Math.max(640, Math.floor(firstVideo.video.videoWidth || 1280))
    height = Math.max(360, Math.floor(firstVideo.video.videoHeight || 720))
  } else if (loaded[0]?.kind === 'image') {
    width = Math.max(640, Math.floor(loaded[0].img.naturalWidth || 1280))
    height = Math.max(360, Math.floor(loaded[0].img.naturalHeight || 720))
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D not supported')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  const snapshot = document.createElement('canvas')
  snapshot.width = width
  snapshot.height = height
  const snapCtx = snapshot.getContext('2d')
  if (!snapCtx) throw new Error('Canvas 2D not supported (snapshot)')

  const fps = 30
  let requestCanvasFrame = () => {}
  let videoStream = canvas.captureStream(fps)
  try {
    const manualStream = canvas.captureStream(0)
    const manualTrack = manualStream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined
    if (manualTrack && typeof manualTrack.requestFrame === 'function') {
      videoStream = manualStream
      requestCanvasFrame = () => manualTrack.requestFrame?.()
    }
  } catch {
    videoStream = canvas.captureStream(fps)
  }

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
    console.warn('[mergeClips] AudioContext unavailable, recording video-only:', err)
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
      console.warn('[mergeClips] soundtrack disabled:', err)
      soundtrackEl = null
    }
  }

  let rafId = 0
  const stopPaint = () => { if (rafId) { cancelAnimationFrame(rafId); rafId = 0 } }

  const loopPaintVideo = (video: HTMLVideoElement, overlays?: ClipOverlay[]) => {
    const tick = () => {
      drawContain(ctx, video, width, height)
      if (overlays && overlays.length > 0) paintOverlays(ctx, width, height, overlays, loadedOverlayImages)
      requestCanvasFrame()
      rafId = requestAnimationFrame(tick)
    }
    tick()
  }
  const loopPaintImage = (img: HTMLImageElement, overlays?: ClipOverlay[]) => {
    const tick = () => {
      drawImageContain(ctx, img, width, height)
      if (overlays && overlays.length > 0) paintOverlays(ctx, width, height, overlays, loadedOverlayImages)
      requestCanvasFrame()
      rafId = requestAnimationFrame(tick)
    }
    tick()
  }

  // Total duration for progress reporting.
  let totalDuration = 0
  for (const l of loaded) totalDuration += l.durationSec

  // Paint the very first frame BEFORE the recorder starts.
  const firstClip = loaded[0]
  if (firstClip.kind === 'video') {
    await new Promise<void>((resolve) => {
      const v = firstClip.video
      const onSeeked = () => {
        v.removeEventListener('seeked', onSeeked)
        drawContain(ctx, v, width, height)
        requestCanvasFrame()
        resolve()
      }
      v.addEventListener('seeked', onSeeked)
      try { v.currentTime = 0 } catch {
        v.removeEventListener('seeked', onSeeked)
        drawContain(ctx, v, width, height)
        requestCanvasFrame()
        resolve()
      }
    })
  } else {
    drawImageContain(ctx, firstClip.img, width, height)
    requestCanvasFrame()
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

  if (soundtrackEl && audio) {
    const winStart = Math.max(0, audio.startSec)
    const winEnd = Math.max(winStart + 0.05, audio.endSec)
    try { soundtrackEl.currentTime = winStart } catch { /* ignore */ }
    const clampTick = () => {
      if (!soundtrackEl) return
      if (soundtrackEl.currentTime >= winEnd) {
        try { soundtrackEl.currentTime = winStart } catch { /* ignore */ }
      }
      soundtrackClampRaf = requestAnimationFrame(clampTick)
    }
    soundtrackClampRaf = requestAnimationFrame(clampTick)
    soundtrackEndedHandler = () => {
      if (!soundtrackEl) return
      try { soundtrackEl.currentTime = winStart } catch { /* ignore */ }
      void soundtrackEl.play().catch(() => { /* ignore */ })
    }
    soundtrackEl.addEventListener('ended', soundtrackEndedHandler)
    try { await soundtrackEl.play() } catch { /* ignore autoplay reject */ }
  }

  let elapsedDuration = 0
  let prevClipNode: MediaElementAudioSourceNode | null = null

  // Snapshot the canvas AFTER finishing the previous clip's paint, so it
  // captures the actual last visible frame (works for both image and video).
  function snapshotCurrent() {
    snapCtx.fillStyle = '#000'
    snapCtx.fillRect(0, 0, width, height)
    snapCtx.drawImage(canvas, 0, 0, width, height)
  }

  // Play a single clip end-to-end (after any optional intro transition has
  // already been resolved by the caller). Resolves when its full duration is up.
  async function playClipBody(l: LoadedClip, overlays: ClipOverlay[] | undefined) {
    if (l.kind === 'video') {
      try { await l.video.play() } catch { /* autoplay */ }
      loopPaintVideo(l.video, overlays)
      await new Promise<void>((resolve) => {
        const onEnded = () => {
          l.video.removeEventListener('ended', onEnded)
          stopPaint()
          resolve()
        }
        l.video.addEventListener('ended', onEnded)
      })
    } else {
      loopPaintImage(l.img, overlays)
      await new Promise<void>((resolve) => setTimeout(resolve, l.durationSec * 1000))
      stopPaint()
    }
  }

  for (let i = 0; i < loaded.length; i++) {
    const l = loaded[i]
    const clipOverlays = overlaysPerClip?.[i]

    // Hook clip audio (videos only).
    let clipNode: MediaElementAudioSourceNode | null = null
    if (l.kind === 'video' && captureClipAudio && audioCtx && audioDest) {
      try {
        clipNode = audioCtx.createMediaElementSource(l.video)
        const gain = audioCtx.createGain()
        gain.gain.value = clipVolume
        clipNode.connect(gain)
        gain.connect(audioDest)
      } catch (err) {
        console.warn('[mergeClips] clip audio skipped:', err)
        clipNode = null
      }
    }

    // Transition INTO this clip from the previous one.
    if (i > 0) {
      const spec = transitions?.[i - 1] ?? { id: 'cut' as TransitionId, durationMs: 0 }
      if (spec.id !== 'cut' && spec.durationMs > 0) {
        // Snapshot whatever is currently on the main canvas (last frame of
        // the outgoing clip + its overlays were just painted).
        snapshotCurrent()

        stopPaint()

        // For video, we want the incoming clip to be playing during the
        // transition so motion is visible. For image, we just draw the still.
        if (l.kind === 'video') {
          try { await l.video.play() } catch { /* autoplay */ }
        }

        const drawIncoming = l.kind === 'video'
          ? () => drawContain(ctx, l.video, width, height)
          : () => drawImageContain(ctx, l.img, width, height)

        const start = performance.now()
        await new Promise<void>((resolve) => {
          const tick = () => {
            const now = performance.now()
            const t = Math.min(1, (now - start) / spec.durationMs)
            paintTransitionFrame(ctx, width, height, snapshot, drawIncoming, spec, t)
            if (clipOverlays && clipOverlays.length > 0) {
              ctx.save()
              ctx.globalAlpha = t
              paintOverlays(ctx, width, height, clipOverlays, loadedOverlayImages)
              ctx.restore()
            }
            if (t >= 1) { resolve(); return }
            rafId = requestAnimationFrame(tick)
          }
          rafId = requestAnimationFrame(tick)
        })

        if (prevClipNode) {
          try { prevClipNode.disconnect() } catch { /* ignore */ }
          prevClipNode = null
        }

        // Continue painting the incoming clip from now on. For an image clip
        // we'll simply hold the still frame for its full duration; the
        // transition time is in addition (matches video behavior).
        await playClipBody(l, clipOverlays)
      } else {
        if (prevClipNode) {
          try { prevClipNode.disconnect() } catch { /* ignore */ }
          prevClipNode = null
        }
        await playClipBody(l, clipOverlays)
      }
    } else {
      // First clip — no transition in.
      await playClipBody(l, clipOverlays)
    }

    elapsedDuration += l.durationSec
    onProgress?.({
      ratio: totalDuration > 0 ? Math.min(1, elapsedDuration / totalDuration) : (i + 1) / loaded.length,
      clipIndex: i + 1,
      totalClips: loaded.length,
    })

    prevClipNode = clipNode
  }

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
