// Browser-side transcode/remux to standard MP4 (H.264 + AAC, +faststart).
//
// MediaRecorder produces WebM (and sometimes fragmented MP4); both fail in
// QuickTime / WMP / mobile gallery players. We always pipe the recording
// through ffmpeg.wasm so the user gets a fully compatible .mp4 file.
//
// Single-threaded core (no SharedArrayBuffer / COOP-COEP required). The
// core .js + .wasm are bundled as Vite assets served from our own origin,
// so a CDN outage can never break Final Film. A single CDN URL is kept as
// a last-resort fallback only.

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

// Vite turns these into URLs to hashed assets under /assets/.
// eslint-disable-next-line import/no-unresolved
import coreUrl from '@ffmpeg/core?url'
// eslint-disable-next-line import/no-unresolved
import wasmUrl from '@ffmpeg/core/wasm?url'
// The engine's worker. `?worker&url` makes Vite compile worker.js + its
// internal imports (const.js / errors.js) into OUR build graph and return a
// stable, served URL. Without this, @ffmpeg/ffmpeg falls back to an implicit
// `new URL('./worker.js', import.meta.url)` which is NOT reliably emitted in
// production (the package is excluded from optimizeDeps), so the worker never
// starts and load() hangs until the 45s timeout. Passing this as
// `classWorkerURL` removes that fragility.
// eslint-disable-next-line import/no-unresolved
import ffmpegWorkerUrl from '@ffmpeg/ffmpeg/worker?worker&url'

export interface Mp4Result {
  blob: Blob
  // Normally the result is a standard MP4. When the engine is unavailable and
  // the source recording is already WebM, we degrade gracefully and return the
  // original WebM rather than failing the whole operation.
  mimeType: 'video/mp4' | 'video/webm'
  extension: 'mp4' | 'webm'
}

/** Progress callback for ensureMp4. `ratio` is 0..1 inside the encode stage. */
export type Mp4ProgressCallback = (info: {
  stage: 'loading' | 'remux' | 'encode' | 'readout'
  ratio: number
}) => void

/** Hard cap per ffmpeg exec call (5 min) — anything longer means hung. */
const FFMPEG_EXEC_TIMEOUT_MS = 5 * 60_000
/**
 * Skip transcode for blobs bigger than this. ffmpeg.wasm holds the whole input
 * in the WASM heap AND fetchFile/writeFile create transient copies, so peak
 * memory is several times the file size. Above this the browser tab OOMs and
 * reloads mid-encode (no file produced). 350 MB keeps a realistic safety margin
 * for typical Final Films; larger ones fall back to a clearly-labeled original.
 */
const MAX_TRANSCODE_BLOB_BYTES = 350 * 1024 * 1024

let ffmpegSingleton: FFmpeg | null = null
let loadingPromise: Promise<FFmpeg> | null = null

const CORE_VERSION = '0.12.6'
const REMOTE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`

/** Best-effort stringify so we never propagate "[object Object]" or non-Error throws. */
export function stringifyAny(e: unknown): string {
  if (e instanceof Error) return e.message || e.name || 'Error'
  if (typeof e === 'string') return e
  if (typeof e === 'number' || typeof e === 'boolean') return String(e)
  if (e == null) return 'unknown error'
  try {
    const s = JSON.stringify(e)
    if (s && s !== '{}') return s
  } catch { /* ignore */ }
  try { return String(e) } catch { return 'unknown error' }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

// We pass `classWorkerURL` pointing at the Vite-bundled engine worker (see the
// import above). This is the supported way to ship the worker in a production
// build where the package is excluded from optimizeDeps — it guarantees the
// worker file is emitted and served, so the LOAD message is answered instead of
// hanging until timeout.
async function loadLocal(ff: FFmpeg): Promise<void> {
  const [core, wasm] = await Promise.all([
    toBlobURL(coreUrl, 'text/javascript'),
    toBlobURL(wasmUrl, 'application/wasm'),
  ])
  await withTimeout(
    ff.load({ coreURL: core, wasmURL: wasm, classWorkerURL: ffmpegWorkerUrl }),
    45_000,
    'FFmpeg core load (local)',
  )
}

async function loadRemote(ff: FFmpeg): Promise<void> {
  const [core, wasm] = await Promise.all([
    toBlobURL(`${REMOTE_BASE}/ffmpeg-core.js`, 'text/javascript'),
    toBlobURL(`${REMOTE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
  ])
  await withTimeout(
    ff.load({ coreURL: core, wasmURL: wasm, classWorkerURL: ffmpegWorkerUrl }),
    45_000,
    'FFmpeg core load (remote)',
  )
}

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    // Each attempt needs a fresh FFmpeg() — once load() fails, the internal
    // worker is in a broken state and the next call will hang again.
    const ffLocal = new FFmpeg()
    try {
      await loadLocal(ffLocal)
      ffmpegSingleton = ffLocal
      return ffLocal
    } catch (eLocal) {
      try { ffLocal.terminate() } catch { /* ignore */ }
      const localMsg = stringifyAny(eLocal)
      const ffRemote = new FFmpeg()
      try {
        await loadRemote(ffRemote)
        ffmpegSingleton = ffRemote
        return ffRemote
      } catch (eRemote) {
        try { ffRemote.terminate() } catch { /* ignore */ }
        throw new Error(
          `Video engine (ffmpeg) failed to start — local: ${localMsg} | remote: ${stringifyAny(eRemote)}`,
        )
      }
    }
  })()
  try {
    return await loadingPromise
  } catch (e) {
    loadingPromise = null
    throw e
  }
}

/** Force-reload the core after a failed exec — releases the WASM heap. */
export async function resetFFmpeg(): Promise<FFmpeg> {
  try { ffmpegSingleton?.terminate() } catch { /* ignore */ }
  ffmpegSingleton = null
  loadingPromise = null
  return await getFFmpeg()
}





function pickInputExt(mimeType: string, fallback?: string): string {
  const mt = (mimeType || '').toLowerCase()
  if (mt.includes('mp4')) return 'mp4'
  if (mt.includes('webm')) return 'webm'
  if (mt.includes('quicktime') || mt.includes('mov')) return 'mov'
  if (mt.includes('matroska') || mt.includes('mkv')) return 'mkv'
  if (fallback) return fallback
  return 'bin'
}

/**
 * Detect an MP4/ISO-BMFF container by its magic bytes (`ftyp` box at offset 4),
 * independent of the (sometimes empty/unreliable) blob mime type. Lets us skip
 * the engine entirely when the recording is already a playable MP4.
 */
async function sniffIsMp4(blob: Blob): Promise<boolean> {
  try {
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
    if (head.length < 8) return false
    // bytes 4..8 spell "ftyp" for an ISO base media file (MP4/MOV).
    return head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70
  } catch {
    return false
  }
}

async function runStage<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    throw new Error(`ffmpeg ${label} failed: ${stringifyAny(e)}`)
  }
}

// Memory-friendly encode args. `ultrafast` uses roughly 3x less RAM than
// `veryfast` at the cost of ~15% larger files — the right trade for a
// browser WASM encoder that has to fit in ~2 GB. The scale filter caps
// width at 1920px so a 4K source can't blow the heap. yuv420p keeps the
// output compatible with QuickTime / mobile gallery players.
function buildEncodeArgs(input: string, output: string, crf: number, maxWidth = 1920): string[] {
  return [
    '-i', input,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-crf', String(crf),
    '-g', '60',
    '-threads', '1',
    '-pix_fmt', 'yuv420p',
    '-vf', `scale='min(${maxWidth},iw)':-2`,
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
    output,
  ]
}

/**
 * Probe a media blob's duration (seconds) via a hidden <video>. MediaRecorder
 * WebM has no duration in its header, so ffmpeg can't compute a progress ratio;
 * knowing the duration up front lets us derive real progress from ffmpeg's log
 * `time=` lines. Returns null when the duration can't be determined.
 */
function probeDurationSeconds(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(blob)
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      const done = (val: number | null) => {
        try { URL.revokeObjectURL(url) } catch { /* ignore */ }
        resolve(val)
      }
      const timer = setTimeout(() => done(null), 8_000)
      v.onloadedmetadata = () => {
        clearTimeout(timer)
        const d = v.duration
        done(Number.isFinite(d) && d > 0 ? d : null)
      }
      v.onerror = () => { clearTimeout(timer); done(null) }
      v.src = url
    } catch {
      resolve(null)
    }
  })
}

/** Parse ffmpeg log line `time=HH:MM:SS.xx` into seconds, or null. */
function parseFfmpegTimeSeconds(line: string): number | null {
  const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line)
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2]), s = Number(m[3])
  if (![h, min, s].every(Number.isFinite)) return null
  return h * 3600 + min * 60 + s
}

/**
 * Ensure the given blob is a standard, broadly compatible MP4.
 *
 * - If it's already an MP4 container, we still run a fast remux with
 *   `-c copy -movflags +faststart` to defragment / move moov to the front.
 * - Otherwise we transcode video to H.264 and audio to AAC.
 *
 * Any failure throws a real `Error` whose message starts with
 * "ffmpeg <stage> failed:" so callers can show something useful.
 */
export async function ensureMp4(
  blob: Blob,
  mimeType?: string,
  onProgress?: Mp4ProgressCallback,
): Promise<Mp4Result> {
  if (blob.size > MAX_TRANSCODE_BLOB_BYTES) {
    throw new Error(
      `Final film is too large to transcode in-browser (${Math.round(blob.size / (1024 * 1024))} MB). ` +
        'Please shorten the project or use fewer 1080p clips.',
    )
  }

  const mt = mimeType || blob.type || ''
  const inExt = pickInputExt(mt)

  // Fast path: MediaRecorder on Chromium already produces standard MP4
  // (H.264/AAC). In that case the engine would only perform a cosmetic
  // faststart remux — not worth loading WASM. Return the recording as-is so
  // trimming succeeds instantly and never touches the engine.
  if (inExt === 'mp4' || (await sniffIsMp4(blob))) {
    onProgress?.({ stage: 'readout', ratio: 1 })
    return { blob, mimeType: 'video/mp4', extension: 'mp4' }
  }

  // Non-MP4 (typically WebM): we need the engine to transcode to MP4.
  onProgress?.({ stage: 'loading', ratio: 0 })
  let ff: FFmpeg
  try {
    ff = await runStage('load', () => getFFmpeg())
  } catch (loadErr) {
    // Engine unavailable (blocked worker, old browser, offline). Degrade
    // gracefully: return the original recording so the operation still
    // completes. It is a valid, playable WebM — we only lose MP4 normalization.
    console.warn(
      '[ensureMp4] engine load failed, returning original recording:',
      stringifyAny(loadErr),
    )
    onProgress?.({ stage: 'readout', ratio: 1 })
    return { blob, mimeType: 'video/webm', extension: 'webm' }
  }

  const inputName = `in.${inExt}`
  const outputName = 'out.mp4'

  // Probe the real duration so we can derive progress from ffmpeg's log lines
  // even when the WebM header carries no duration (the usual MediaRecorder case
  // that left the UI frozen at 0%).
  const durationSec = await probeDurationSeconds(blob)

  // Aggregate progress from three sources and only ever move forward:
  //  - native `progress` event (works when duration is known to ffmpeg)
  //  - parsed `time=` from the log stream / duration probe (the reliable path)
  //  - a slow heartbeat so a long single step never looks frozen.
  let lastRatio = 0
  const report = (r: number) => {
    const clamped = Math.max(0, Math.min(0.99, r))
    if (clamped <= lastRatio) return
    lastRatio = clamped
    onProgress?.({ stage: 'encode', ratio: clamped })
  }

  const onFfProgress = (e: { progress: number }) => {
    if (Number.isFinite(e?.progress)) report(e.progress)
  }
  const onFfLog = (e: { message: string }) => {
    if (!durationSec) return
    const t = parseFfmpegTimeSeconds(e?.message || '')
    if (t != null) report(t / durationSec)
  }
  try { ff.on('progress', onFfProgress) } catch { /* ignore */ }
  try { ff.on('log', onFfLog) } catch { /* ignore */ }

  // Heartbeat: nudge progress upward slowly while encoding, capped at 95%, so
  // the percentage is never visually stuck even if both signals go quiet.
  const heartbeat = setInterval(() => {
    if (lastRatio < 0.95) report(lastRatio + 0.01)
  }, 1_500)

  const detach = () => {
    clearInterval(heartbeat)
    try { ff.off('progress', onFfProgress) } catch { /* ignore */ }
    try { ff.off('log', onFfLog) } catch { /* ignore */ }
  }

  const writeInput = async (instance: FFmpeg) => {
    await runStage('writeFile', async () => {
      await instance.writeFile(inputName, await fetchFile(blob))
    })
  }
  await writeInput(ff)

  // Per-exec timeout so a hung ffmpeg call surfaces a real error instead of
  // leaving the UI stuck forever. On timeout we terminate the WASM instance to
  // release its heap.
  const execWithTimeout = async (label: string, args: string[]) => {
    try {
      await withTimeout(ff.exec(args), FFMPEG_EXEC_TIMEOUT_MS, `ffmpeg ${label}`)
    } catch (e) {
      if (e instanceof Error && /timed out/i.test(e.message)) {
        try { ffmpegSingleton?.terminate() } catch { /* ignore */ }
        ffmpegSingleton = null
        loadingPromise = null
      }
      throw e
    }
  }

  onProgress?.({ stage: 'encode', ratio: 0 })
  try {
    await runStage('encode', () => execWithTimeout('encode', buildEncodeArgs(inputName, outputName, 23, 1920)))
  } catch (err1) {
    // First attempt stalled/failed (often a slow 1080p single-thread encode).
    // Retry once at 720p — markedly faster and lighter, so it completes where
    // 1080p timed out — re-attaching the progress listeners to the fresh core.
    console.warn('[ensureMp4] 1080p encode failed, retrying at 720p:', stringifyAny(err1))
    lastRatio = 0
    try { await ff.deleteFile(inputName) } catch { /* ignore */ }
    ff = await runStage('load (retry)', () => resetFFmpeg())
    try { ff.on('progress', onFfProgress) } catch { /* ignore */ }
    try { ff.on('log', onFfLog) } catch { /* ignore */ }
    await writeInput(ff)
    await runStage('encode (retry)', () => execWithTimeout('encode (retry)', buildEncodeArgs(inputName, outputName, 28, 1280)))
  }

  onProgress?.({ stage: 'readout', ratio: 1 })
  const data = await runStage('readFile', () => ff.readFile(outputName))
  detach()
  try { await ff.deleteFile(inputName) } catch { /* noop */ }
  try { await ff.deleteFile(outputName) } catch { /* noop */ }

  const u8 = data as Uint8Array
  const ab = new ArrayBuffer(u8.byteLength)
  new Uint8Array(ab).set(u8)
  const out = new Blob([ab], { type: 'video/mp4' })
  return { blob: out, mimeType: 'video/mp4', extension: 'mp4' }
}

/** Pre-warm the ffmpeg core (optional). */
export function preloadMp4Transcoder(): void {
  void getFFmpeg().catch(() => { /* noop — will retry on demand */ })
}
