// Deterministic, frame-accurate Final Film encoder built on WebCodecs +
// mp4-muxer.
//
// Why this exists: the legacy `mergeVideoUrls` path (mergeVideos.ts) records the
// merge canvas LIVE with MediaRecorder. Live encoding is tied to wall-clock
// performance, so whenever the machine falls behind 30fps it drops/duplicates
// frames and that stutter gets permanently baked into the downloaded file.
//
// This module removes wall-clock from the equation entirely:
//   - Video: every output frame is produced deterministically (seek → paint →
//     encode). The VideoEncoder is awaited via back-pressure, so NO frame is
//     ever dropped, regardless of how slow the host is. The result is a smooth
//     MP4 every time, just slower to produce.
//   - Audio: the full music + voiceover + clip-audio mix is rendered offline
//     with OfflineAudioContext (sample-accurate) and AAC-encoded.
//
// It reuses the exact canvas painters from mergeVideos.ts (drawContain,
// paintTransitionFrame, overlay) so the output looks identical to the legacy
// path — only the encoding strategy changes.

import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import {
  type MergeClip,
  type MergeResult,
  type MergeProgressCallback,
  type MergeAudioOptions,
  type TransitionSpec,
  type TransitionId,
  type MergeOverlayOptions,
  type ClipItem,
  MergeCancelledError,
  loadClip,
  clipSource,
  drawContain,
  paintTransitionFrame,
  normalizeAudioOptions,
  setMergeOverlay,
} from './mergeVideos'

/** Thrown when the browser lacks the WebCodecs surface this encoder needs, so
 *  the caller can fall back to the legacy MediaRecorder path. */
export class WebCodecsUnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebCodecsUnsupportedError'
  }
}

/** Fast, synchronous capability gate used by the caller to pick a pipeline. */
export function canEncodeWithWebCodecs(): boolean {
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof AudioData !== 'undefined' &&
    typeof OfflineAudioContext !== 'undefined'
  )
}

const FPS = 30
const SAMPLE_RATE = 48000
const AUDIO_CHANNELS = 2

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : t
    const target = Math.max(0, Math.min(dur - 1e-3, t))
    if (Math.abs(video.currentTime - target) < 1e-3) {
      resolve()
      return
    }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      video.removeEventListener('seeked', finish)
      resolve()
    }
    const timer = setTimeout(finish, 2500)
    video.addEventListener('seeked', finish)
    try {
      video.currentTime = target
    } catch {
      finish()
    }
  })
}

/** Wait until the encoder queue drains below a threshold (back-pressure). */
async function drainQueue(enc: VideoEncoder, max = 8): Promise<void> {
  while (enc.encodeQueueSize > max) {
    await new Promise((r) => setTimeout(r, 4))
  }
}

async function pickVideoCodec(
  width: number,
  height: number,
  bitrate: number,
): Promise<string> {
  const candidates = [
    'avc1.640028', // High 4.0
    'avc1.4d0028', // Main 4.0
    'avc1.42E028', // Baseline 4.0
    'avc1.640020',
    'avc1.42001f',
  ]
  for (const codec of candidates) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: FPS,
      })
      if (res.supported) return codec
    } catch {
      /* try next */
    }
  }
  throw new WebCodecsUnsupportedError('No supported H.264 encoder configuration')
}

async function decodeAudio(url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    // A short-lived context just for decoding; closed immediately after.
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctor()
    try {
      const decoded = await ctx.decodeAudioData(buf.slice(0))
      return decoded
    } finally {
      try { await ctx.close() } catch { /* ignore */ }
    }
  } catch {
    return null
  }
}

/**
 * Render the complete audio mix (music + voiceover + per-clip audio) offline,
 * sample-accurate, into a single stereo AudioBuffer. Returns null when there is
 * no audible content at all.
 */
async function renderAudioMix(
  clips: ClipItem[],
  clipDefs: MergeClip[],
  totalDuration: number,
  norm: ReturnType<typeof normalizeAudioOptions>,
): Promise<AudioBuffer | null> {
  const music = norm?.music && norm.music.endSec > norm.music.startSec ? norm.music : undefined
  const voiceover = norm?.voiceover ?? undefined
  const useSoundtrack = Boolean(music || voiceover)
  const musicVolume = Math.max(0, Math.min(1, music?.musicVolume ?? 1))
  const voiceoverVolume = Math.max(0, Math.min(1, voiceover?.volume ?? 1))
  const clipVolume = Math.max(0, Math.min(1, norm?.clipVolume ?? (useSoundtrack ? 0 : 1)))

  const length = Math.max(1, Math.ceil(totalDuration * SAMPLE_RATE))
  const octx = new OfflineAudioContext(AUDIO_CHANNELS, length, SAMPLE_RATE)
  let scheduled = false

  // --- Music: loop the selected window across its timeline placement. -------
  if (music) {
    const buffer = await decodeAudio(music.src)
    if (buffer) {
      const winLen = Math.max(0.05, music.endSec - music.startSec)
      const tlStart = Math.max(0, music.timelineStartSec ?? 0)
      const tlEnd = Math.min(totalDuration, music.timelineEndSec ?? totalDuration)
      let pos = tlStart
      while (pos < tlEnd - 1e-3) {
        const playLen = Math.min(winLen, tlEnd - pos)
        const src = octx.createBufferSource()
        src.buffer = buffer
        const gain = octx.createGain()
        gain.gain.value = musicVolume
        src.connect(gain).connect(octx.destination)
        try { src.start(pos, music.startSec, playLen) } catch { /* ignore */ }
        pos += playLen
        scheduled = true
      }
    }
  }

  // --- Voiceover: play once through its timeline window. --------------------
  if (voiceover) {
    const buffer = await decodeAudio(voiceover.src)
    if (buffer) {
      const srcStart = Math.max(0, voiceover.sourceStartSec ?? 0)
      const srcEnd = voiceover.sourceEndSec ?? buffer.duration
      const tlStart = Math.max(0, voiceover.timelineStartSec ?? 0)
      const tlEnd = Math.min(totalDuration, voiceover.timelineEndSec ?? totalDuration)
      const playLen = Math.max(0, Math.min(srcEnd - srcStart, tlEnd - tlStart))
      if (playLen > 0.01) {
        const src = octx.createBufferSource()
        src.buffer = buffer
        const gain = octx.createGain()
        gain.gain.value = voiceoverVolume
        src.connect(gain).connect(octx.destination)
        try { src.start(tlStart, srcStart, playLen) } catch { /* ignore */ }
        scheduled = true
      }
    }
  }

  // --- Per-clip audio at each clip's timeline offset. ----------------------
  if (clipVolume > 0) {
    let offset = 0
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const def = clipDefs[i]
      if (clip.kind === 'video' && def.kind === 'video') {
        const buffer = await decodeAudio(def.url)
        if (buffer) {
          const playLen = Math.min(clip.duration, buffer.duration)
          if (playLen > 0.01) {
            const src = octx.createBufferSource()
            src.buffer = buffer
            const gain = octx.createGain()
            gain.gain.value = clipVolume
            src.connect(gain).connect(octx.destination)
            try { src.start(offset, 0, playLen) } catch { /* ignore */ }
            scheduled = true
          }
        }
      }
      offset += clip.duration
    }
  }

  if (!scheduled) return null
  return await octx.startRendering()
}

function preventAudioClipping(buffer: AudioBuffer): AudioBuffer {
  let peak = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i] || 0)
      if (v > peak) peak = v
    }
  }
  // Leave normal material untouched. When music + voice + clip audio stack over
  // full-scale, scale the whole rendered mix down deterministically so AAC
  // encoding never receives clipped samples (the audible "noise" report).
  if (peak <= 0.98) return buffer
  const gain = 0.98 / peak
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < data.length; i++) data[i] *= gain
  }
  return buffer
}

export async function mergeVideoUrlsWebCodecs(
  inputs: Array<string | MergeClip>,
  onProgress?: MergeProgressCallback,
  audio?: MergeAudioOptions,
  transitions?: TransitionSpec[],
  signal?: AbortSignal,
  overlay?: MergeOverlayOptions,
): Promise<MergeResult> {
  if (inputs.length === 0) throw new Error('No videos to merge')
  if (signal?.aborted) throw new MergeCancelledError()
  if (!canEncodeWithWebCodecs()) {
    throw new WebCodecsUnsupportedError('WebCodecs not available in this browser')
  }

  const checkAbort = () => { if (signal?.aborted) throw new MergeCancelledError() }

  // Configure the shared overlay state used by the canvas painters.
  await setMergeOverlay(overlay)

  const clipDefs: MergeClip[] = inputs.map((it) =>
    typeof it === 'string' ? { kind: 'video', url: it } : it,
  )

  const norm = normalizeAudioOptions(audio)
  const music = norm?.music && norm.music.endSec > norm.music.startSec ? norm.music : undefined
  const voiceover = norm?.voiceover ?? undefined
  const useSoundtrack = Boolean(music || voiceover)
  const clipVolume = Math.max(0, Math.min(1, norm?.clipVolume ?? (useSoundtrack ? 0 : 1)))
  const captureClipAudio = clipVolume > 0

  const totalClips = clipDefs.length

  // --- Load every clip up front (deterministic, no inter-clip gaps). -------
  const clips: ClipItem[] = []
  for (let i = 0; i < totalClips; i++) {
    checkAbort()
    clips.push(await loadClip(clipDefs[i], captureClipAudio, `#${i + 1} of ${totalClips}`))
  }

  // Mute clip elements; their audio is mixed offline, not captured live.
  for (const c of clips) {
    if (c.kind === 'video') {
      c.video.muted = true
      c.video.volume = 0
    }
  }

  let totalDuration = 0
  for (const c of clips) totalDuration += c.duration
  if (totalDuration <= 0) throw new Error('Nothing to encode (zero total duration)')

  // --- Output dimensions: cap long side at 1080, keep aspect, even dims. ---
  const MAX_LONG_SIDE = 1080
  let width = Math.max(640, Math.floor(clips[0].width || 1280))
  let height = Math.max(360, Math.floor(clips[0].height || 720))
  const longSide = Math.max(width, height)
  if (longSide > MAX_LONG_SIDE) {
    const s = MAX_LONG_SIDE / longSide
    width = Math.round((width * s) / 2) * 2
    height = Math.round((height * s) / 2) * 2
  }
  width = Math.max(2, Math.round(width / 2) * 2)
  height = Math.max(2, Math.round(height / 2) * 2)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Canvas 2D not supported')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  // Snapshot canvas for transition outgoing frames.
  const snapshot = document.createElement('canvas')
  snapshot.width = width
  snapshot.height = height
  const snapCtx = snapshot.getContext('2d', { alpha: false })
  if (!snapCtx) throw new Error('Canvas 2D not supported (snapshot)')

  // --- Prepare the audio mix first so the muxer knows whether to include it.
  onProgress?.({ ratio: 0, clipIndex: 0, totalClips, stage: 'loading' })
  let audioBuffer: AudioBuffer | null = null
  try {
    const mixed = await renderAudioMix(clips, clipDefs, totalDuration, norm)
    audioBuffer = mixed ? preventAudioClipping(mixed) : null
  } catch (err) {
    console.warn('[webcodecs] audio mix failed, encoding video-only:', err)
    audioBuffer = null
  }
  checkAbort()

  // --- Muxer + encoders ----------------------------------------------------
  const bitrate = Math.max(3_000_000, Math.min(12_000_000, Math.round(width * height * FPS * 0.1)))
  const codec = await pickVideoCodec(width, height, bitrate)

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: FPS },
    ...(audioBuffer
      ? { audio: { codec: 'aac', numberOfChannels: AUDIO_CHANNELS, sampleRate: SAMPLE_RATE } }
      : {}),
    fastStart: 'in-memory',
  })

  let encoderError: Error | null = null
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encoderError = e instanceof Error ? e : new Error(String(e)) },
  })
  videoEncoder.configure({ codec, width, height, bitrate, framerate: FPS })

  // --- Encode video frames deterministically ------------------------------
  const totalFrames = Math.max(1, Math.round(totalDuration * FPS))
  const frameDurUs = Math.round(1_000_000 / FPS)
  let globalFrame = 0
  let prevClip: ClipItem | null = null

  for (let i = 0; i < clips.length; i++) {
    checkAbort()
    if (encoderError) throw encoderError
    const clip = clips[i]
    const clipFrames = Math.max(1, Math.round(clip.duration * FPS))

    // Transition INTO this clip.
    const spec: TransitionSpec = i > 0
      ? (transitions?.[i - 1] ?? { id: 'cut' as TransitionId, durationMs: 0 })
      : { id: 'cut', durationMs: 0 }
    const transitionFrames = i > 0 && spec.id !== 'cut' && spec.durationMs > 0
      ? Math.min(clipFrames, Math.round((spec.durationMs / 1000) * FPS))
      : 0

    // Snapshot the outgoing clip's last frame once for the transition blend.
    if (transitionFrames > 0 && prevClip) {
      snapCtx.fillStyle = '#000'
      snapCtx.fillRect(0, 0, width, height)
      drawContain(snapCtx, clipSource(prevClip), width, height)
    }

    const incoming = clipSource(clip)

    for (let f = 0; f < clipFrames; f++) {
      checkAbort()
      if (encoderError) throw encoderError
      const localTime = f / FPS

      if (clip.kind === 'video') {
        await seekTo(clip.video, localTime)
      }

      if (f < transitionFrames) {
        const t = transitionFrames > 1 ? f / transitionFrames : 1
        paintTransitionFrame(ctx, width, height, snapshot, incoming, spec, t)
      } else {
        drawContain(ctx, incoming, width, height)
      }

      const timestamp = globalFrame * frameDurUs
      const frame = new VideoFrame(canvas, { timestamp, duration: frameDurUs })
      videoEncoder.encode(frame, { keyFrame: globalFrame % (FPS * 5) === 0 })
      frame.close()
      await drainQueue(videoEncoder)

      globalFrame++
      if (globalFrame % 5 === 0) {
        onProgress?.({
          ratio: Math.min(0.9, globalFrame / totalFrames),
          clipIndex: i + 1,
          totalClips,
          stage: 'recording',
        })
      }
    }

    prevClip = clip
  }

  onProgress?.({ ratio: 0.92, clipIndex: totalClips, totalClips, stage: 'encoding' })
  await videoEncoder.flush()
  videoEncoder.close()
  if (encoderError) throw encoderError

  // --- Encode audio --------------------------------------------------------
  if (audioBuffer) {
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => { encoderError = e instanceof Error ? e : new Error(String(e)) },
    })
    audioEncoder.configure({
      codec: 'mp4a.40.2',
      numberOfChannels: AUDIO_CHANNELS,
      sampleRate: SAMPLE_RATE,
      bitrate: 192_000,
    })

    const ch0 = audioBuffer.getChannelData(0)
    const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0
    const total = audioBuffer.length
    const CHUNK = 4800 // 0.1s
    for (let offset = 0; offset < total; offset += CHUNK) {
      checkAbort()
      if (encoderError) throw encoderError
      const n = Math.min(CHUNK, total - offset)
      const planar = new Float32Array(n * AUDIO_CHANNELS)
      planar.set(ch0.subarray(offset, offset + n), 0)
      planar.set(ch1.subarray(offset, offset + n), n)
      const timestamp = Math.round((offset / SAMPLE_RATE) * 1_000_000)
      const data = new AudioData({
        format: 'f32-planar',
        sampleRate: SAMPLE_RATE,
        numberOfFrames: n,
        numberOfChannels: AUDIO_CHANNELS,
        timestamp,
        data: planar,
      })
      audioEncoder.encode(data)
      data.close()
    }
    await audioEncoder.flush()
    audioEncoder.close()
    if (encoderError) throw encoderError
  }

  onProgress?.({ ratio: 0.99, clipIndex: totalClips, totalClips, stage: 'finalizing' })
  muxer.finalize()

  // Release decoded clip elements.
  for (const c of clips) {
    if (c.kind === 'video') {
      try { c.video.pause() } catch { /* ignore */ }
      try { c.video.removeAttribute('src'); c.video.load() } catch { /* ignore */ }
    }
  }

  const { buffer } = muxer.target as ArrayBufferTarget
  const blob = new Blob([buffer], { type: 'video/mp4' })
  return { blob, mimeType: 'video/mp4', extension: 'mp4' }
}
