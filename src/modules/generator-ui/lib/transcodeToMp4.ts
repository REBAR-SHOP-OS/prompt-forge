// Browser-side transcode/remux to standard MP4 (H.264 + AAC, +faststart).
//
// MediaRecorder produces either WebM or fragmented MP4 — both fail in
// QuickTime/WMP/mobile gallery players. We pipe the output through
// ffmpeg.wasm so the user always gets a fully compatible .mp4 file.
//
// Single-threaded core (no SharedArrayBuffer / COOP-COEP required).

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

export interface Mp4Result {
  blob: Blob
  mimeType: 'video/mp4'
  extension: 'mp4'
}

let ffmpegSingleton: FFmpeg | null = null
let loadingPromise: Promise<FFmpeg> | null = null

const CORE_VERSION = '0.12.6'
const CDN_BASES = [
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`,
]

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

async function loadFromBase(ff: FFmpeg, base: string): Promise<void> {
  await withTimeout(
    ff.load({
      coreURL: `${base}/ffmpeg-core.js`,
      wasmURL: `${base}/ffmpeg-core.wasm`,
    }),
    30_000,
    `FFmpeg core load (${new URL(base).host})`,
  )
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    const ff = new FFmpeg()
    const failures: string[] = []
    for (const base of CDN_BASES) {
      try {
        await loadFromBase(ff, base)
        ffmpegSingleton = ff
        return ff
      } catch (e) {
        failures.push(`${new URL(base).host}: ${stringifyAny(e)}`)
        // Continue to next CDN.
      }
    }
    throw new Error(
      `FFmpeg core could not be loaded from any CDN — ${failures.join(' | ')}`,
    )
  })()
  try {
    return await loadingPromise
  } catch (e) {
    // Allow a future call to retry instead of remembering the failure forever.
    loadingPromise = null
    throw e
  }
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

/**
 * Ensure the given blob is a standard, broadly compatible MP4.
 *
 * - If it's already an MP4 container, we still run a fast remux with
 *   `-c copy -movflags +faststart` to defragment / move moov to the front.
 * - Otherwise we transcode video to H.264 and audio to AAC.
 *
 * Returns a fresh blob; the caller owns it. Any failure throws a real
 * `Error` whose message starts with "ffmpeg <stage> failed:" so callers can
 * always show something useful to the user.
 */
export async function ensureMp4(blob: Blob, mimeType?: string): Promise<Mp4Result> {
  const ff = await runStage('load', () => getFFmpeg())
  const mt = mimeType || blob.type || ''
  const inExt = pickInputExt(mt)
  const inputName = `in.${inExt}`
  const outputName = 'out.mp4'

  await runStage('writeFile', async () => {
    await ff.writeFile(inputName, await fetchFile(blob))
  })

  const isMp4 = inExt === 'mp4'
  const encodeArgs = [
    '-i', inputName,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outputName,
  ]
  const remuxArgs = [
    '-i', inputName,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputName,
  ]

  try {
    if (isMp4) {
      await runStage('remux', () => ff.exec(remuxArgs))
    } else {
      await runStage('encode', () => ff.exec(encodeArgs))
    }
  } catch (err) {
    // Remux of an mp4 input failed (e.g. unsupported codec inside) — try
    // a full encode as a last resort. For non-mp4 inputs we already tried
    // encoding, so rethrow.
    if (isMp4) {
      await runStage('encode (fallback)', () => ff.exec(encodeArgs))
    } else {
      throw err
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
