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

export interface Mp4Result {
  blob: Blob
  mimeType: 'video/mp4'
  extension: 'mp4'
}

let ffmpegSingleton: FFmpeg | null = null
let loadingPromise: Promise<FFmpeg> | null = null

const CORE_VERSION = '0.12.6'
const REMOTE_FALLBACK = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`

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

async function loadLocal(ff: FFmpeg): Promise<void> {
  // Worker-style cross-origin loads require blob URLs of the same origin.
  const [core, wasm] = await Promise.all([
    toBlobURL(coreUrl, 'text/javascript'),
    toBlobURL(wasmUrl, 'application/wasm'),
  ])
  await withTimeout(
    ff.load({ coreURL: core, wasmURL: wasm }),
    60_000,
    'FFmpeg core load (local)',
  )
}

async function loadRemote(ff: FFmpeg): Promise<void> {
  const [core, wasm] = await Promise.all([
    toBlobURL(`${REMOTE_FALLBACK}/ffmpeg-core.js`, 'text/javascript'),
    toBlobURL(`${REMOTE_FALLBACK}/ffmpeg-core.wasm`, 'application/wasm'),
  ])
  await withTimeout(
    ff.load({ coreURL: core, wasmURL: wasm }),
    60_000,
    'FFmpeg core load (remote)',
  )
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    const ff = new FFmpeg()
    try {
      await loadLocal(ff)
      ffmpegSingleton = ff
      return ff
    } catch (eLocal) {
      const localMsg = stringifyAny(eLocal)
      try {
        await loadRemote(ff)
        ffmpegSingleton = ff
        return ff
      } catch (eRemote) {
        throw new Error(
          `FFmpeg core could not be loaded — local: ${localMsg} | remote: ${stringifyAny(eRemote)}`,
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
async function resetFFmpeg(): Promise<FFmpeg> {
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
function buildEncodeArgs(input: string, output: string, crf: number): string[] {
  return [
    '-i', input,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-crf', String(crf),
    '-g', '60',
    '-threads', '1',
    '-pix_fmt', 'yuv420p',
    '-vf', "scale='min(1920,iw)':-2",
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
    output,
  ]
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
export async function ensureMp4(blob: Blob, mimeType?: string): Promise<Mp4Result> {
  let ff = await runStage('load', () => getFFmpeg())
  const mt = mimeType || blob.type || ''
  const inExt = pickInputExt(mt)
  const inputName = `in.${inExt}`
  const outputName = 'out.mp4'

  const writeInput = async (instance: FFmpeg) => {
    await runStage('writeFile', async () => {
      await instance.writeFile(inputName, await fetchFile(blob))
    })
  }
  await writeInput(ff)

  const isMp4 = inExt === 'mp4'
  const remuxArgs = [
    '-i', inputName,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputName,
  ]

  let succeeded = false
  if (isMp4) {
    try {
      await runStage('remux', () => ff.exec(remuxArgs))
      succeeded = true
    } catch (err) {
      // Remux of an mp4 input failed (e.g. unsupported codec inside).
      // Fall through to a memory-friendly encode.
      console.warn('[ensureMp4] remux failed, will encode:', stringifyAny(err))
    }
  }

  if (!succeeded) {
    try {
      await runStage('encode', () => ff.exec(buildEncodeArgs(inputName, outputName, 23)))
      succeeded = true
    } catch (err1) {
      // OOM / abort: terminate the core to release the WASM heap, reload,
      // and retry once at a higher CRF (smaller frames, less memory pressure).
      console.warn('[ensureMp4] first encode failed, retrying after reset:', stringifyAny(err1))
      try { await ff.deleteFile(inputName) } catch { /* ignore */ }
      ff = await runStage('load (retry)', () => resetFFmpeg())
      await writeInput(ff)
      await runStage('encode (retry)', () => ff.exec(buildEncodeArgs(inputName, outputName, 28)))
    }
  }

  const data = await runStage('readFile', () => ff.readFile(outputName))
  // Cleanup virtual FS so repeated calls don't leak memory.
  try { await ff.deleteFile(inputName) } catch { /* noop */ }
  try { await ff.deleteFile(outputName) } catch { /* noop */ }

  const u8 = data as Uint8Array
  // Copy into a fresh ArrayBuffer so the Blob type matches BlobPart strictly
  // (avoids SharedArrayBuffer-typed buffer issues from ffmpeg.wasm output).
  const ab = new ArrayBuffer(u8.byteLength)
  new Uint8Array(ab).set(u8)
  const out = new Blob([ab], { type: 'video/mp4' })
  return { blob: out, mimeType: 'video/mp4', extension: 'mp4' }
}

/** Pre-warm the ffmpeg core (optional). */
export function preloadMp4Transcoder(): void {
  void getFFmpeg().catch(() => { /* noop — will retry on demand */ })
}
