// In-browser video concatenation via canvas + MediaRecorder.
//
// - Sequentially plays each source URL into a hidden <video>, paints frames
//   onto a shared <canvas>, and captures the canvas stream.
// - Image clips are painted directly onto the same canvas for their
//   configured duration — no fake WebM round-trip, no duration probe.
// - Always emits a real audio track in the recorded MediaStream.
// - Supports per-gap transitions (cut/fade/crossfade/slide/wipe/zoom) painted
//   on the canvas during a short overlap between the outgoing and incoming
//   clip.
// - Emits the browser recorder's stable WebM/Opus output directly. MP4
//   transcoding is intentionally kept out of the Final Film path because
//   ffmpeg.wasm can hang/OOM on long clips and strand the UI at 95%.

export interface MergeProgress {
  ratio: number
  clipIndex: number
  totalClips: number
  stage?: 'loading' | 'recording' | 'transition' | 'finalizing' | 'encoding' | 'uploading'
}

export type MergeProgressCallback = (p: MergeProgress) => void

export interface MergeMusicTrack {
  src: string
  /** Source window inside the audio file. */
  startSec: number
  endSec: number
  /** 0..1, default 1 */
  musicVolume?: number
  /** Placement on the final video timeline (seconds). Defaults to whole video. */
  timelineStartSec?: number
  timelineEndSec?: number
}

export interface MergeVoiceoverTrack {
  src: string
  /** 0..1, default 1 */
  volume?: number
  /** Source window inside the voiceover file. Defaults to whole file. */
  sourceStartSec?: number
  sourceEndSec?: number
  /** Placement on the final video timeline (seconds). Defaults to whole video. */
  timelineStartSec?: number
  timelineEndSec?: number
}

export interface MergeAudioOptions {
  /** Background music with a selected window. */
  music?: MergeMusicTrack
  /** Voiceover playing within its timeline window. */
  voiceover?: MergeVoiceoverTrack
  /** 0..1. Defaults to 0 when music or voiceover is present, 1 otherwise. */
  clipVolume?: number
  // --- Back-compat: older callers passed a flat MergeMusicTrack shape. ---
  src?: string
  startSec?: number
  endSec?: number
  musicVolume?: number
}

function normalizeAudioOptions(audio?: MergeAudioOptions): {
  music?: MergeMusicTrack
  voiceover?: MergeVoiceoverTrack
  clipVolume?: number
} | undefined {
  if (!audio) return undefined
  // Legacy flat shape -> wrap as music.
  if (typeof audio.src === 'string' && !audio.music && !audio.voiceover) {
    return {
      music: {
        src: audio.src,
        startSec: audio.startSec ?? 0,
        endSec: audio.endSec ?? 0,
        musicVolume: audio.musicVolume,
      },
      clipVolume: audio.clipVolume,
    }
  }
  return { music: audio.music, voiceover: audio.voiceover, clipVolume: audio.clipVolume }
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

/**
 * Contact / branding text overlay burned into every recorded frame.
 * Each entry in `lines` becomes one row of text (e.g. website, phone, address).
 */
export interface MergeOverlayOptions {
  lines: string[]
  position?: 'top' | 'center' | 'bottom'
  /** Normalized 0–1 center position when the user has dragged the overlay.
   *  Takes precedence over `position` when set. */
  offset?: { x: number; y: number }
  /** Optional logo (data URL or same-origin URL) drawn above the text. */
  logoUrl?: string
  /** Size multiplier for the overlay (logo + text). 1 = default. */
  scale?: number
  /** Show the translucent backdrop panel behind the logo + text. */
  panelEnabled?: boolean
  /** Hex color of the backdrop panel. */
  panelColor?: string
  /** Opacity of the backdrop panel (0–1). */
  panelOpacity?: number
}



/**
 * Input clip descriptor for {@link mergeVideoUrls}. The merger handles image
 * clips natively (no MediaRecorder round-trip), so still images get painted
 * directly on the merge canvas for `durationSec` seconds.
 */
export type MergeClip =
  | { kind: 'video'; url: string }
  | { kind: 'image'; url: string; durationSec: number }

type ClipItem =
  | { kind: 'video'; video: HTMLVideoElement; duration: number; width: number; height: number }
  | { kind: 'image'; image: HTMLImageElement; duration: number; width: number; height: number }

function pickMimeType(): string {
  // We deliberately prefer WebM over MP4 here. Chromium's MediaRecorder MP4
  // output is fragmented ISO BMFF that plays inside browsers but fails in
  // QuickTime, Windows Media Player, mobile gallery viewers, and most
  // downstream tools — users were getting "downloaded final film won't play"
  // reports. WebM (VP9/VP8 + Opus) from MediaRecorder is well-formed and plays
  // in VLC, modern desktop players, browsers, Android, Telegram, Discord, etc.
  const candidates = [
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

// WebM produced by MediaRecorder (e.g. previous Final Film outputs or webm
// source snapshots) reports `duration === Infinity` until the element is
// seeked past the end. A clip with an unknown/infinite duration breaks the
// end-of-clip detection (the `ended` event never fires reliably and the
// time-based watchdog computes an infinite timeout), which is exactly what
// made Final Film hang forever at the recording cap (94%). We force the real
// duration to materialize by seeking to a huge time, then rewind to 0.
function resolveRealDuration(v: HTMLVideoElement, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Number.isFinite(v.duration) && v.duration > 0) {
      resolve()
      return
    }
    const giveUp = setTimeout(() => {
      cleanup()
      // Couldn't materialize a finite duration; fail clearly instead of
      // letting the merge hang on this clip later.
      reject(new Error(`Clip ${label} has an unreadable duration — source may be a malformed/streaming file`))
    }, 8000)
    const onDurationChange = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) {
        cleanup()
        try { v.currentTime = 0 } catch { /* ignore */ }
        resolve()
      }
    }
    const cleanup = () => {
      clearTimeout(giveUp)
      v.removeEventListener('durationchange', onDurationChange)
      v.removeEventListener('seeked', onDurationChange)
    }
    v.addEventListener('durationchange', onDurationChange)
    v.addEventListener('seeked', onDurationChange)
    try {
      v.currentTime = 1e7
    } catch {
      cleanup()
      reject(new Error(`Clip ${label} has an unreadable duration`))
    }
  })
}

async function loadVideo(url: string, withAudio: boolean, clipLabel?: string): Promise<HTMLVideoElement> {
  const v = await new Promise<HTMLVideoElement>((resolve, reject) => {
    const el = document.createElement('video')
    el.crossOrigin = 'anonymous'
    el.preload = 'auto'
    el.muted = !withAudio
    el.playsInline = true
    const label = clipLabel ?? url
    // Hard timeout so a single broken/expired URL can't hang Final Film forever.
    const timeout = setTimeout(() => {
      reject(new Error(`Clip ${label} did not load metadata within 20s — source may be expired or unreachable`))
    }, 20000)
    el.onloadedmetadata = () => {
      clearTimeout(timeout)
      if (!el.videoWidth || !el.videoHeight) {
        reject(new Error(`Clip ${label} has no playable content (${el.videoWidth}x${el.videoHeight})`))
        return
      }
      resolve(el)
    }
    el.onerror = () => {
      clearTimeout(timeout)
      reject(new Error(`Failed to load clip ${label}`))
    }
    el.src = url
  })
  // Ensure a finite, usable duration before the clip enters the merge loop.
  await resolveRealDuration(v, clipLabel ?? url)
  return v
}

async function loadImage(url: string, clipLabel?: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const label = clipLabel ?? url
    const timeout = setTimeout(() => {
      reject(new Error(`Image clip ${label} did not load within 20s`))
    }, 20000)
    img.onload = () => {
      clearTimeout(timeout)
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error(`Image clip ${label} has no pixels (${img.naturalWidth}x${img.naturalHeight})`))
        return
      }
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timeout)
      reject(new Error(`Failed to load image clip ${label}`))
    }
    img.src = url
  })
}

async function loadClip(c: MergeClip, withAudio: boolean, label: string): Promise<ClipItem> {
  if (c.kind === 'image') {
    const image = await loadImage(c.url, label)
    return {
      kind: 'image',
      image,
      duration: Math.max(0.05, c.durationSec),
      width: image.naturalWidth,
      height: image.naturalHeight,
    }
  }
  const video = await loadVideo(c.url, withAudio, label)
  return {
    kind: 'video',
    video,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    width: video.videoWidth,
    height: video.videoHeight,
  }
}

function clipSource(c: ClipItem): HTMLVideoElement | HTMLImageElement {
  return c.kind === 'video' ? c.video : c.image
}

// Active contact/branding overlay for the current merge run. Set at the start
// of mergeVideoUrls and cleared when it finishes so it never leaks across runs.
let activeOverlay: MergeOverlayOptions | null = null
let activeLogo: HTMLImageElement | null = null

/**
 * Draw the contact/branding text lines onto the merge canvas. Called after each
 * frame paint so the text is baked into every captured frame (and transitions).
 */
function drawOverlay(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
  const overlay = activeOverlay
  if (!overlay) return
  const lines = overlay.lines.map((l) => l.trim()).filter(Boolean)
  const logo = activeLogo
  if (lines.length === 0 && !logo) return

  const position = overlay.position ?? 'bottom'
  const panelEnabled = overlay.panelEnabled !== false
  const panelColor = overlay.panelColor ?? '#000000'
  const panelOpacity = typeof overlay.panelOpacity === 'number' ? overlay.panelOpacity : 0.45
  const panelFill = overlayHexToRgba(panelColor, panelOpacity)
  const scale = Math.min(2, Math.max(0.5, overlay.scale ?? 1))
  const fontSize = Math.max(14, Math.round(ch * 0.032 * scale))
  const lineGap = Math.round(fontSize * 0.45)
  const padX = Math.round(cw * 0.04)
  const padY = Math.round(fontSize * 0.6)
  const lineHeight = fontSize + lineGap

  // Logo dimensions (preserve aspect, height ~12% of frame).
  let logoW = 0
  let logoH = 0
  if (logo && logo.naturalWidth && logo.naturalHeight) {
    logoH = Math.round(ch * 0.12 * scale)
    logoW = Math.round(logoH * (logo.naturalWidth / logo.naturalHeight))
  }
  const logoGap = logoH ? Math.round(fontSize * 0.6) : 0

  const textBlockHeight = lines.length ? lines.length * lineHeight - lineGap : 0
  const contentHeight = textBlockHeight + logoH + logoGap
  const blockHeight = contentHeight + padY * 2

  ctx.save()
  ctx.textBaseline = 'top'
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`

  // Custom dragged position: a centered translucent panel anchored at the
  // stored normalized point, clamped so it stays fully on-screen.
  if (overlay.offset) {
    const panelW = Math.min(Math.round(cw * 0.92), Math.round(cw * 0.7))
    const panelH = blockHeight
    const cx = Math.min(cw - panelW / 2, Math.max(panelW / 2, overlay.offset.x * cw))
    const cy = Math.min(ch - panelH / 2, Math.max(panelH / 2, overlay.offset.y * ch))
    const panelX = Math.round(cx - panelW / 2)
    const panelY = Math.round(cy - panelH / 2)
    const radius = Math.round(fontSize * 0.6)
    if (panelEnabled) {
      ctx.fillStyle = panelFill
      roundRect(ctx, panelX, panelY, panelW, panelH, radius)
      ctx.fill()
    }

    let y = panelY + padY
    if (logoH) {
      ctx.drawImage(logo as HTMLImageElement, Math.round(cx - logoW / 2), y, logoW, logoH)
      y += logoH + logoGap
    }
    ctx.shadowColor = 'rgba(0,0,0,0.85)'
    ctx.shadowBlur = Math.round(fontSize * 0.25)
    ctx.shadowOffsetY = 1
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    for (const line of lines) {
      ctx.fillText(line, Math.round(cx), y, panelW - padX)
      y += lineHeight
    }
    ctx.restore()
    return
  }

  if (position === 'center') {

    // Centered translucent panel with centered content.
    const panelW = Math.round(cw * 0.92)
    const panelX = Math.round((cw - panelW) / 2)
    const panelY = Math.round((ch - blockHeight) / 2)
    const radius = Math.round(fontSize * 0.6)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    roundRect(ctx, panelX, panelY, panelW, blockHeight, radius)
    ctx.fill()

    let y = panelY + padY
    if (logoH) {
      ctx.drawImage(logo as HTMLImageElement, Math.round((cw - logoW) / 2), y, logoW, logoH)
      y += logoH + logoGap
    }
    ctx.shadowColor = 'rgba(0,0,0,0.85)'
    ctx.shadowBlur = Math.round(fontSize * 0.25)
    ctx.shadowOffsetY = 1
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    for (const line of lines) {
      ctx.fillText(line, Math.round(cw / 2), y, panelW - padX)
      y += lineHeight
    }
    ctx.restore()
    return
  }

  const barY = position === 'top' ? 0 : ch - blockHeight
  // Translucent gradient bar for legibility on any footage.
  const grad = ctx.createLinearGradient(0, barY, 0, barY + blockHeight)
  if (position === 'top') {
    grad.addColorStop(0, 'rgba(0,0,0,0.62)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
  } else {
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.62)')
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, barY, cw, blockHeight)

  let y = barY + padY
  if (logoH) {
    ctx.drawImage(logo as HTMLImageElement, padX, y, logoW, logoH)
    y += logoH + logoGap
  }
  ctx.shadowColor = 'rgba(0,0,0,0.85)'
  ctx.shadowBlur = Math.round(fontSize * 0.25)
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 1
  ctx.fillStyle = '#ffffff'
  for (const line of lines) {
    ctx.fillText(line, padX, y, cw - padX * 2)
    y += lineHeight
  }
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement | HTMLImageElement,
  cw: number,
  ch: number,
) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, cw, ch)
  const vw = source instanceof HTMLImageElement ? source.naturalWidth : source.videoWidth
  const vh = source instanceof HTMLImageElement ? source.naturalHeight : source.videoHeight
  if (!vw || !vh) { drawOverlay(ctx, cw, ch); return }
  const scale = Math.min(cw / vw, ch / vh)
  const dw = vw * scale
  const dh = vh * scale
  const dx = (cw - dw) / 2
  const dy = (ch - dh) / 2
  ctx.drawImage(source, dx, dy, dw, dh)
  drawOverlay(ctx, cw, ch)
}


function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/**
 * Paint a single transition frame composed of the outgoing snapshot (canvas
 * with last frame of clip A) and the incoming live source (clip B, which may
 * be a video element or a still image).
 */
function paintTransitionFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  outgoing: HTMLCanvasElement,
  incoming: HTMLVideoElement | HTMLImageElement,
  spec: TransitionSpec,
  t: number,
) {
  const e = easeInOut(t)

  const drawIncoming = () => drawContain(ctx, incoming, width, height)
  const drawOutgoing = () => {
    ctx.drawImage(outgoing, 0, 0, width, height)
  }

  const body = () => {
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
  body()
  drawOverlay(ctx, width, height)
}


export class MergeCancelledError extends Error {
  constructor() {
    super('Merge cancelled')
    this.name = 'MergeCancelledError'
  }
}

export async function mergeVideoUrls(
  inputs: Array<string | MergeClip>,
  onProgress?: MergeProgressCallback,
  audio?: MergeAudioOptions,
  transitions?: TransitionSpec[],
  signal?: AbortSignal,
  overlay?: MergeOverlayOptions,
): Promise<MergeResult> {
  if (inputs.length === 0) throw new Error('No videos to merge')
  if (signal?.aborted) throw new MergeCancelledError()

  // Contact/branding overlay baked into every frame for this run.
  const hasText = !!overlay && overlay.lines.some((l) => l.trim())
  const hasLogo = !!overlay?.logoUrl
  activeOverlay = overlay && (hasText || hasLogo)
    ? { lines: overlay.lines, position: overlay.position ?? 'bottom', offset: overlay.offset, logoUrl: overlay.logoUrl, scale: overlay.scale ?? 1 }
    : null
  // Preload the logo image so drawOverlay (sync) can paint it on every frame.
  activeLogo = null
  if (activeOverlay?.logoUrl) {
    try {
      activeLogo = await loadImage(activeOverlay.logoUrl, 'contact logo')
    } catch {
      activeLogo = null
    }
  }

  // Normalize: accept legacy `string[]` (always videos) or `MergeClip[]`.
  const clipDefs: MergeClip[] = inputs.map((it) =>
    typeof it === 'string' ? { kind: 'video', url: it } : it,
  )


  const norm = normalizeAudioOptions(audio)
  const musicTrack = norm?.music && norm.music.endSec > norm.music.startSec ? norm.music : undefined
  const voiceoverTrack = norm?.voiceover ?? undefined
  const useSoundtrack = Boolean(musicTrack || voiceoverTrack)
  const musicVolume = Math.max(0, Math.min(1, musicTrack?.musicVolume ?? 1))
  const voiceoverVolume = Math.max(0, Math.min(1, voiceoverTrack?.volume ?? 1))
  const clipVolume = Math.max(0, Math.min(1, norm?.clipVolume ?? (useSoundtrack ? 0 : 1)))
  const captureClipAudio = clipVolume > 0

  const totalClips = clipDefs.length
  const first = await loadClip(clipDefs[0], captureClipAudio, `#1 of ${totalClips}`)
  const width = Math.max(640, Math.floor(first.width || 1280))
  const height = Math.max(360, Math.floor(first.height || 720))

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
  let soundtrackGain: GainNode | null = null
  let gateRaf = 0
  if (musicTrack && audioCtx && audioDest) {
    try {
      soundtrackEl = document.createElement('audio')
      soundtrackEl.crossOrigin = 'anonymous'
      soundtrackEl.src = musicTrack.src
      soundtrackEl.preload = 'auto'
      // We handle looping manually so we always wrap to winStart, never to 0.
      soundtrackEl.loop = false
      await new Promise<void>((resolve, reject) => {
        const onReady = () => { soundtrackEl!.removeEventListener('loadedmetadata', onReady); resolve() }
        const onErr = () => { soundtrackEl!.removeEventListener('error', onErr); reject(new Error('Failed to load soundtrack')) }
        soundtrackEl!.addEventListener('loadedmetadata', onReady)
        soundtrackEl!.addEventListener('error', onErr)
      })
      soundtrackEl.currentTime = Math.max(0, musicTrack.startSec)
      const source = audioCtx.createMediaElementSource(soundtrackEl)
      const gain = audioCtx.createGain()
      gain.gain.value = musicVolume
      source.connect(gain)
      gain.connect(audioDest)
      soundtrackGain = gain
    } catch (err) {
      console.warn('[mergeVideoUrls] soundtrack disabled:', err)
      soundtrackEl = null
    }
  }

  // Voiceover: plays inside its timeline window, mixed alongside music + clip audio.
  let voiceoverEl: HTMLAudioElement | null = null
  let voiceoverGain: GainNode | null = null
  if (voiceoverTrack && audioCtx && audioDest) {
    try {
      voiceoverEl = document.createElement('audio')
      voiceoverEl.crossOrigin = 'anonymous'
      voiceoverEl.src = voiceoverTrack.src
      voiceoverEl.preload = 'auto'
      voiceoverEl.loop = false
      await new Promise<void>((resolve, reject) => {
        const onReady = () => { voiceoverEl!.removeEventListener('loadedmetadata', onReady); resolve() }
        const onErr = () => { voiceoverEl!.removeEventListener('error', onErr); reject(new Error('Failed to load voiceover')) }
        voiceoverEl!.addEventListener('loadedmetadata', onReady)
        voiceoverEl!.addEventListener('error', onErr)
      })
      voiceoverEl.currentTime = Math.max(0, voiceoverTrack.sourceStartSec ?? 0)
      const vSource = audioCtx.createMediaElementSource(voiceoverEl)
      const vGain = audioCtx.createGain()
      vGain.gain.value = voiceoverVolume
      vSource.connect(vGain)
      vGain.connect(audioDest)
      voiceoverGain = vGain
    } catch (err) {
      console.warn('[mergeVideoUrls] voiceover disabled:', err)
      voiceoverEl = null
    }
  }

  let rafId = 0
  // Frame-accurate painter for video clips: when the browser exposes
  // requestVideoFrameCallback (rVFC), paint ONLY when the decoder hands us a
  // new frame. This eliminates the "rAF lag → duplicated frame baked into the
  // recording" class of bugs that caused Final Film to look frozen in spots
  // even though the source clip played fine. We also keep a low-rate rAF
  // safety repaint so a single missed rVFC tick never leaves a stale frame
  // on the canvas being captured.
  type VFCCapableVideo = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, meta: unknown) => void) => number
    cancelVideoFrameCallback?: (handle: number) => void
  }
  let activeVfcHandle = 0
  let activeVfcVideo: VFCCapableVideo | null = null
  let paintGen = 0
  let safetyTimer: ReturnType<typeof setTimeout> | null = null

  const stopPaint = () => {
    paintGen += 1
    cancelAnimationFrame(rafId)
    rafId = 0
    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null }
    if (activeVfcVideo && activeVfcHandle && activeVfcVideo.cancelVideoFrameCallback) {
      try { activeVfcVideo.cancelVideoFrameCallback(activeVfcHandle) } catch { /* ignore */ }
    }
    activeVfcVideo = null
    activeVfcHandle = 0
  }

  const loopPaint = (video: HTMLVideoElement) => {
    stopPaint()
    paintGen += 1
    const myGen = paintGen

    const v = video as VFCCapableVideo
    if (typeof v.requestVideoFrameCallback === 'function') {
      activeVfcVideo = v
      const onFrame = () => {
        if (paintGen !== myGen) return
        drawContain(ctx, video, width, height)
        if (!video.paused && !video.ended && activeVfcVideo === v) {
          activeVfcHandle = v.requestVideoFrameCallback!(onFrame)
        }
      }
      activeVfcHandle = v.requestVideoFrameCallback(onFrame)
      const safetyTick = () => {
        if (paintGen !== myGen) return
        drawContain(ctx, video, width, height)
        safetyTimer = setTimeout(safetyTick, 100)
      }
      safetyTick()
    } else {
      const tick = () => {
        if (paintGen !== myGen) return
        drawContain(ctx, video, width, height)
        rafId = requestAnimationFrame(tick)
      }
      tick()
    }
  }

  const paintStillImage = (image: HTMLImageElement) => {
    stopPaint()
    paintGen += 1
    const myGen = paintGen
    // Paint once, then repaint at ~10fps so the captured canvas stream never
    // appears to "freeze" from the recorder's perspective even if a browser
    // pauses emitting frames when canvas is static.
    const tick = () => {
      if (paintGen !== myGen) return
      drawContain(ctx, image, width, height)
      safetyTimer = setTimeout(tick, 100)
    }
    tick()
  }

  const startPainting = (clip: ClipItem) => {
    if (clip.kind === 'image') paintStillImage(clip.image)
    else loopPaint(clip.video)
  }

  /**
   * Resolve when the given video clip reaches the end. See video-clip notes
   * inline below (stall detection, missed-event watchdog, etc).
   */
  function whenVideoEnded(video: HTMLVideoElement): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        video.removeEventListener('ended', onEnded)
        if (timer) clearTimeout(timer)
        if (stallTimer) clearInterval(stallTimer)
        try {
          if (recorder.state === 'paused') recorder.resume()
        } catch { /* ignore */ }
        stopPaint()
        resolve()
      }
      const onEnded = () => finish()
      if (video.ended) { finish(); return }
      video.addEventListener('ended', onEnded)
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
      const remaining = Math.max(0, dur - (video.currentTime || 0))
      // Absolute ceiling so a clip with a missing/odd duration can never make
      // the merge wait forever. Generous (clip length + 10s, capped at 45s).
      const maxWaitMs = Math.min(45_000, Math.ceil(remaining * 1000) + 10_000)
      const timer = setTimeout(() => {
        if (!done) {
          console.warn('[mergeVideoUrls] ended event missed; advancing via timeout')
          finish()
        }
      }, Math.max(4000, maxWaitMs))

      let lastTime = video.currentTime
      let lastChangeAt = performance.now()
      let resumeAttempts = 0
      const stallTimer = setInterval(() => {
        if (done) return
        const ct = video.currentTime
        if (Math.abs(ct - lastTime) > 0.01) {
          lastTime = ct
          lastChangeAt = performance.now()
          return
        }
        // Playhead hasn't moved. If we're effectively at the end of the clip,
        // treat it as finished instead of trying to resume forever — this is
        // the case that pinned Final Film at 94% for clips whose `ended` event
        // never arrived (notably WebM sources).
        const atEnd = dur > 0 && ct >= dur - 0.25
        const stalledFor = performance.now() - lastChangeAt
        if (video.ended || (atEnd && stalledFor > 300)) {
          finish()
          return
        }
        // Try to recover playback whether the element is paused (a rejected
        // autoplay/play()) or just stalled mid-stream. Re-kicking play() while
        // paused is exactly the case that previously pinned Final Film at 94%
        // because the old guard (`!video.paused`) never retried a paused clip.
        if (stalledFor > 500 && !video.ended) {
          resumeAttempts += 1
          try { if (recorder.state === 'paused') recorder.resume() } catch { /* ignore */ }
          video.play().catch(() => { /* ignore */ })
        }
        // Hard stall escape hatch: if the playhead has made NO progress for a
        // long stretch despite repeated resume attempts, stop waiting and let
        // the pipeline advance cleanly instead of hanging the whole merge.
        // Covers unknown-duration clips AND known-duration clips whose decoder
        // wedged (the real-world "stuck at 94%" report). Kept aggressive so a
        // single bad clip frees the UI in a few seconds, not minutes.
        if (stalledFor > 4000 && resumeAttempts >= 2) {
          console.warn('[mergeVideoUrls] clip stalled with no progress; advancing', { dur, ct })
          finish()
        }
      }, 200)

    })
  }

  /** Resolve after `durationSec` for image clips; delegate to whenVideoEnded otherwise. */
  function whenClipEnded(clip: ClipItem): Promise<void> {
    if (clip.kind === 'image') {
      return new Promise<void>((resolve) =>
        setTimeout(() => { stopPaint(); resolve() }, Math.max(50, clip.duration * 1000)),
      )
    }
    return whenVideoEnded(clip.video)
  }

  // Pre-load ALL clips before starting the recorder. This avoids capturing
  // black frames at the start while videos are still being fetched/decoded,
  // and removes inter-clip loading gaps.
  const preloaded: ClipItem[] = [first]
  for (let i = 1; i < clipDefs.length; i++) {
    if (signal?.aborted) throw new MergeCancelledError()
    preloaded.push(await loadClip(clipDefs[i], captureClipAudio, `#${i + 1} of ${totalClips}`))
  }
  let totalDuration = 0
  for (const c of preloaded) totalDuration += c.duration

  // Paint the very first frame onto the canvas BEFORE the recorder starts so
  // the captured stream begins on real content (not a black fill).
  if (first.kind === 'video') {
    const firstVideo = first.video
    await new Promise<void>((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        clearTimeout(seekTimer)
        firstVideo.removeEventListener('seeked', onSeeked)
        try { drawContain(ctx, firstVideo, width, height) } catch { /* ignore */ }
        resolve()
      }
      const onSeeked = () => done()
      // Never block the whole merge on a first-frame seek that never fires
      // (some proxied/streaming sources load metadata but stall on seek). Paint
      // whatever frame we have after a short grace period and proceed.
      const seekTimer = setTimeout(() => {
        console.warn('[mergeVideoUrls] first-frame seek timed out; painting current frame')
        done()
      }, 5000)
      firstVideo.addEventListener('seeked', onSeeked)
      try {
        firstVideo.currentTime = 0
      } catch {
        done()
      }
    })
  } else {
    drawContain(ctx, first.image, width, height)
  }

  const chosenMime = pickMimeType()
  // Default MediaRecorder canvas-capture bitrate (~2.5 Mbps) is far too low for
  // 1080p / vertical HD clips and visibly softened the Final Film. Pick a
  // resolution-aware target (~0.18 bits/px/frame) clamped to a sane range so
  // the merged film keeps the sharpness of the source cards.
  const targetVideoBitrate = Math.round(width * height * fps * 0.18)
  const videoBitsPerSecond = Math.max(8_000_000, Math.min(40_000_000, targetVideoBitrate))
  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(outStream, {
      mimeType: chosenMime,
      videoBitsPerSecond,
      audioBitsPerSecond: 192_000,
    })
  } catch (err) {
    console.warn('[mergeVideoUrls] high-bitrate recorder rejected, falling back:', err)
    recorder = new MediaRecorder(outStream, { mimeType: chosenMime })
  }
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }
  let recorderError: Error | null = null
  recorder.onerror = (ev) => {
    const err = (ev as unknown as { error?: Error }).error
    recorderError = err instanceof Error ? err : new Error('MediaRecorder error')
    console.error('[mergeVideoUrls] recorder error:', recorderError)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })
  recorder.start(250)

  // Unified timeline gating: each track only plays while the global playhead is
  // inside its timeline window. Outside the window the track is silenced and
  // paused. Inside the window each track maps the global time into its source
  // window (music loops inside its window; voiceover plays once through it).
  // Shared real film playhead, updated by the clip loop below. The audio gate
  // reads this (NOT wall-clock) so music/voiceover apply at the exact film
  // second the user selected, regardless of clip loading/stall/transition time.
  let filmElapsed = 0
  let activeClip: ClipItem | null = null
  let activeImageStartMs: number | null = null
  const currentFilmTime = (): number => {
    if (activeClip?.kind === 'video') {
      const ct = Number.isFinite(activeClip.video.currentTime) ? activeClip.video.currentTime : 0
      return filmElapsed + Math.max(0, ct)
    }
    if (activeImageStartMs != null) {
      return filmElapsed + Math.max(0, (performance.now() - activeImageStartMs) / 1000)
    }
    return filmElapsed
  }

  {
    const musicWinStart = Math.max(0, musicTrack?.startSec ?? 0)
    const musicWinEnd = Math.max(musicWinStart + 0.05, musicTrack?.endSec ?? 0)
    const musicTlStart = Math.max(0, musicTrack?.timelineStartSec ?? 0)
    const musicTlEnd = musicTrack?.timelineEndSec != null && musicTrack.timelineEndSec > musicTlStart
      ? musicTrack.timelineEndSec
      : (totalDuration > 0 ? totalDuration : Number.POSITIVE_INFINITY)

    const voiceSrcStart = Math.max(0, voiceoverTrack?.sourceStartSec ?? 0)
    const voiceSrcEnd = voiceoverTrack?.sourceEndSec != null && voiceoverTrack.sourceEndSec > voiceSrcStart
      ? voiceoverTrack.sourceEndSec
      : (voiceoverEl ? voiceoverEl.duration : 0)
    const voiceTlStart = Math.max(0, voiceoverTrack?.timelineStartSec ?? 0)
    const voiceTlEnd = voiceoverTrack?.timelineEndSec != null && voiceoverTrack.timelineEndSec > voiceTlStart
      ? voiceoverTrack.timelineEndSec
      : (totalDuration > 0 ? totalDuration : Number.POSITIVE_INFINITY)

    const gateTick = () => {
      const gt = currentFilmTime()

      if (soundtrackEl && soundtrackGain) {
        const inWin = gt >= musicTlStart && gt < musicTlEnd
        if (inWin) {
          soundtrackGain.gain.value = musicVolume
          if (soundtrackEl.currentTime >= musicWinEnd || soundtrackEl.currentTime < musicWinStart) {
            try { soundtrackEl.currentTime = musicWinStart } catch { /* ignore */ }
          }
          if (soundtrackEl.paused) void soundtrackEl.play().catch(() => { /* ignore */ })
        } else {
          soundtrackGain.gain.value = 0
          if (!soundtrackEl.paused) { try { soundtrackEl.pause() } catch { /* ignore */ } }
        }
      }

      if (voiceoverEl && voiceoverGain) {
        const inWin = gt >= voiceTlStart && gt < voiceTlEnd
        if (inWin) {
          voiceoverGain.gain.value = voiceoverVolume
          const target = voiceSrcStart + (gt - voiceTlStart)
          if (voiceSrcEnd > voiceSrcStart && target >= voiceSrcEnd) {
            voiceoverGain.gain.value = 0
            if (!voiceoverEl.paused) { try { voiceoverEl.pause() } catch { /* ignore */ } }
          } else {
            if (Math.abs(voiceoverEl.currentTime - target) > 0.3) {
              try { voiceoverEl.currentTime = Math.max(0, target) } catch { /* ignore */ }
            }
            if (voiceoverEl.paused) void voiceoverEl.play().catch(() => { /* ignore */ })
          }
        } else {
          voiceoverGain.gain.value = 0
          if (!voiceoverEl.paused) { try { voiceoverEl.pause() } catch { /* ignore */ } }
        }
      }

      gateRaf = requestAnimationFrame(gateTick)
    }
    gateRaf = requestAnimationFrame(gateTick)
  }


  let elapsedDuration = 0
  let prevClip: ClipItem | null = null
  let prevClipNode: MediaElementAudioSourceNode | null = null

  // Live progress ticker: emits progress every ~250ms based on the live
  // playhead of the current clip (or wall-clock for image clips).
  let liveTicker: ReturnType<typeof setInterval> | null = null
  const startLiveProgress = (
    clip: ClipItem,
    clipIndex: number,
    stage: MergeProgress['stage'],
    imageStartMs?: number,
  ) => {
    // Expose the currently playing clip to the audio gate so it can compute the
    // exact film playhead (elapsed + this clip's position).
    activeClip = clip
    activeImageStartMs = imageStartMs ?? null
    if (liveTicker) clearInterval(liveTicker)
    liveTicker = setInterval(() => {
      let ct = 0
      if (clip.kind === 'video') {
        ct = Number.isFinite(clip.video.currentTime) ? clip.video.currentTime : 0
      } else if (imageStartMs != null) {
        ct = Math.min(clip.duration, Math.max(0, (performance.now() - imageStartMs) / 1000))
      }
      const ratio = totalDuration > 0
        ? Math.min(0.99, (elapsedDuration + ct) / totalDuration)
        : clipIndex / totalClips
      onProgress?.({ ratio, clipIndex, totalClips, stage })
    }, 250)
  }
  const stopLiveProgress = () => {
    if (liveTicker) { clearInterval(liveTicker); liveTicker = null }
  }

  const abortPromise = new Promise<'aborted'>((resolve) => {
    if (!signal) return
    if (signal.aborted) { resolve('aborted'); return }
    signal.addEventListener('abort', () => resolve('aborted'), { once: true })
  })
  const raceAbort = async <T,>(p: Promise<T>): Promise<T> => {
    const r = await Promise.race([p, abortPromise])
    if (r === 'aborted') throw new MergeCancelledError()
    return r as T
  }

  for (let i = 0; i < preloaded.length; i++) {
    if (signal?.aborted) throw new MergeCancelledError()

    const clip = preloaded[i]
    const dur = clip.duration

    let clipNode: MediaElementAudioSourceNode | null = null
    if (clip.kind === 'video' && captureClipAudio && audioCtx && audioDest) {
      try {
        clipNode = audioCtx.createMediaElementSource(clip.video)
        const gain = audioCtx.createGain()
        gain.gain.value = clipVolume
        clipNode.connect(gain)
        gain.connect(audioDest)
      } catch (err) {
        console.warn('[mergeVideoUrls] clip audio skipped:', err)
        clipNode = null
      }
    }

    const startClipPlayback = async (): Promise<number | undefined> => {
      if (clip.kind === 'video') {
        try { await clip.video.play() } catch (err) {
          console.warn('[mergeVideoUrls] play() rejected for clip', i, err)
        }
        return undefined
      }
      // Image clip: no media playback, just record the start time for progress.
      return performance.now()
    }

    // Transition INTO this clip from the previous one.
    if (i > 0 && prevClip) {
      const spec = transitions?.[i - 1] ?? { id: 'cut' as TransitionId, durationMs: 0 }
      if (spec.id !== 'cut' && spec.durationMs > 0) {
        // Snapshot the last frame of the outgoing clip.
        snapCtx.fillStyle = '#000'
        snapCtx.fillRect(0, 0, width, height)
        drawContain(snapCtx, clipSource(prevClip), width, height)

        // Begin playing the incoming clip; we paint the blended frame manually.
        stopPaint()
        const endedPromise = whenClipEnded(clip)
        const imageStartMs = await startClipPlayback()
        startLiveProgress(clip, i + 1, 'transition', imageStartMs)

        const incomingSource = clipSource(clip)
        const start = performance.now()
        await new Promise<void>((resolve) => {
          const tick = () => {
            const now = performance.now()
            const t = Math.min(1, (now - start) / spec.durationMs)
            paintTransitionFrame(ctx, width, height, snapshot, incomingSource, spec, t)
            const incomingEnded = clip.kind === 'video' && clip.video.ended
            if (t >= 1 || incomingEnded) {
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
        startPainting(clip)
        startLiveProgress(clip, i + 1, 'recording', imageStartMs)
        await raceAbort(endedPromise)
      } else {
        // Cut: behave like before.
        if (prevClipNode) {
          try { prevClipNode.disconnect() } catch { /* ignore */ }
          prevClipNode = null
        }
        const endedPromise = whenClipEnded(clip)
        const imageStartMs = await startClipPlayback()
        startPainting(clip)
        startLiveProgress(clip, i + 1, 'recording', imageStartMs)
        await raceAbort(endedPromise)
      }
    } else {
      // First clip — no transition in.
      const endedPromise = whenClipEnded(clip)
      const imageStartMs = await startClipPlayback()
      startPainting(clip)
      startLiveProgress(clip, i + 1, 'recording', imageStartMs)
      await raceAbort(endedPromise)
    }

    stopLiveProgress()
    elapsedDuration += dur
    filmElapsed = elapsedDuration
    activeClip = null
    activeImageStartMs = null
    onProgress?.({
      ratio: totalDuration > 0 ? Math.min(0.99, elapsedDuration / totalDuration) : (i + 1) / totalClips,
      clipIndex: i + 1,
      totalClips,
      stage: 'recording',
    })

    prevClip = clip
    prevClipNode = clipNode
  }
  stopLiveProgress()

  // Cleanup tail
  if (prevClipNode) {
    try { prevClipNode.disconnect() } catch { /* ignore */ }
  }

  // Pause any playback BEFORE stopping the recorder so no extra frames/audio
  // sneak in during the stop handshake.
  for (const c of preloaded) {
    if (c.kind === 'video') {
      try { c.video.pause() } catch { /* ignore */ }
    }
  }
  if (gateRaf) cancelAnimationFrame(gateRaf)
  if (soundtrackEl) {
    try { soundtrackEl.pause() } catch { /* ignore */ }
  }
  if (voiceoverEl) {
    try { voiceoverEl.pause() } catch { /* ignore */ }
  }
  stopPaint()

  onProgress?.({ ratio: 0.95, clipIndex: totalClips, totalClips, stage: 'finalizing' })

  try { recorder.requestData() } catch { /* ignore */ }
  await new Promise((r) => setTimeout(r, 100))

  try {
    if (recorder.state !== 'inactive') recorder.stop()
  } catch (err) {
    console.warn('[mergeVideoUrls] recorder.stop() threw:', err)
  }
  let finalizeTimedOut = false
  await Promise.race([
    stopped,
    new Promise<void>((resolve) =>
      setTimeout(() => { finalizeTimedOut = true; resolve() }, 8000),
    ),
  ])
  if (finalizeTimedOut) {
    console.warn('[mergeVideoUrls] recorder.onstop never fired within 8s — finalizing with current chunks')
    try { recorder.requestData() } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 200))
  }

  // Clear the per-run overlay so it never leaks into a later merge.
  activeOverlay = null
  activeLogo = null

  // Final cleanup of media elements + audio graph.
  for (const c of preloaded) {
    if (c.kind === 'video') {
      try { c.video.removeAttribute('src'); c.video.load() } catch { /* ignore */ }
    }
  }
  if (voiceoverEl) {
    try { voiceoverEl.removeAttribute('src'); voiceoverEl.load() } catch { /* ignore */ }
  }
  if (soundtrackEl) {
    try { soundtrackEl.removeAttribute('src'); soundtrackEl.load() } catch { /* ignore */ }
  }
  try {
    for (const t of outStream.getTracks()) t.stop()
  } catch { /* ignore */ }
  if (audioCtx) {
    try { await audioCtx.close() } catch { /* ignore */ }
  }

  if (recorderError) throw recorderError
  if (chunks.length === 0) throw new Error('Recorder produced no data')

  const blob = new Blob(chunks, { type: chosenMime })
  if (blob.size === 0) throw new Error('Recorder produced an empty blob')

  onProgress?.({ ratio: 0.99, clipIndex: totalClips, totalClips, stage: 'finalizing' })
  return { blob, mimeType: chosenMime, extension: mimeTypeToExtension(chosenMime) }
}
