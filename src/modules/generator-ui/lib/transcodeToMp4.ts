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
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    const ff = new FFmpeg()
    await ff.load({
      coreURL: `${CORE_BASE}/ffmpeg-core.js`,
      wasmURL: `${CORE_BASE}/ffmpeg-core.wasm`,
    })
    ffmpegSingleton = ff
    return ff
  })()
  return loadingPromise
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
 * Ensure the given blob is a standard, broadly compatible MP4.
 *
 * - If it's already an MP4 container, we still run a fast remux with
 *   `-c copy -movflags +faststart` to defragment / move moov to the front.
 * - Otherwise we transcode video to H.264 and audio to AAC.
 *
 * Returns a fresh blob; the caller owns it.
 */
export async function ensureMp4(blob: Blob, mimeType?: string): Promise<Mp4Result> {
  const ff = await getFFmpeg()
  const mt = mimeType || blob.type || ''
  const inExt = pickInputExt(mt)
  const inputName = `in.${inExt}`
  const outputName = 'out.mp4'

  await ff.writeFile(inputName, await fetchFile(blob))

  const isMp4 = inExt === 'mp4'
  try {
    if (isMp4) {
      // Try fast remux first (no re-encode).
      await ff.exec([
        '-i', inputName,
        '-c', 'copy',
        '-movflags', '+faststart',
        outputName,
      ])
    } else {
      await ff.exec([
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputName,
      ])
    }
  } catch (err) {
    // Remux failed (e.g. unsupported codec inside mp4) — fall back to full encode.
    if (isMp4) {
      await ff.exec([
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputName,
      ])
    } else {
      throw err
    }
  }

  const data = await ff.readFile(outputName)
  // Cleanup virtual FS so repeated calls don't leak memory.
  try { await ff.deleteFile(inputName) } catch { /* noop */ }
  try { await ff.deleteFile(outputName) } catch { /* noop */ }

  const u8 = data as Uint8Array
  const out = new Blob([u8], { type: 'video/mp4' })
  return { blob: out, mimeType: 'video/mp4', extension: 'mp4' }
}

/** Pre-warm the ffmpeg core (optional). */
export function preloadMp4Transcoder(): void {
  void getFFmpeg().catch(() => { /* noop — will retry on demand */ })
}
