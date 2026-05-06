// In-browser video concatenation using ffmpeg.wasm.
// Produces a real MP4 (H.264 + AAC) with audio preserved from each clip.
//
// Why ffmpeg.wasm instead of MediaRecorder/canvas:
//  - MediaRecorder cannot produce MP4 in most browsers (only webm).
//  - canvas.captureStream drops audio tracks.
// ffmpeg.wasm gives us a deterministic, real MP4 with audio every time.

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

export interface MergeProgress {
  /** 0..1 overall progress estimate. */
  ratio: number
  /** 1-based index of the clip currently being processed. */
  clipIndex: number
  totalClips: number
}

export type MergeProgressCallback = (p: MergeProgress) => void

let ffmpegInstance: FFmpeg | null = null
let ffmpegLoadPromise: Promise<FFmpeg> | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance
  if (ffmpegLoadPromise) return ffmpegLoadPromise

  ffmpegLoadPromise = (async () => {
    const ff = new FFmpeg()
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
    await ff.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpegInstance = ff
    return ff
  })()
  return ffmpegLoadPromise
}

function extFromUrl(url: string): string {
  try {
    const u = new URL(url, window.location.href)
    const m = u.pathname.match(/\.([a-zA-Z0-9]{2,5})(?:$|\?)/)
    if (m) return m[1].toLowerCase()
  } catch { /* ignore */ }
  return 'mp4'
}

/**
 * Merge multiple video URLs into a single MP4 blob (H.264 + AAC, with audio).
 */
export async function mergeVideoUrls(
  urls: string[],
  onProgress?: MergeProgressCallback,
): Promise<Blob> {
  if (urls.length === 0) throw new Error('No videos to merge')

  const ff = await getFFmpeg()

  // Stage 1: download + transcode each clip to a normalized intermediate MP4
  // (same codec, fps, sample rate, audio layout). Concat demuxer requires
  // matching streams across inputs.
  const intermediateNames: string[] = []
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    const inputName = `in_${i}.${extFromUrl(url)}`
    const outName = `seg_${i}.mp4`

    const data = await fetchFile(url)
    await ff.writeFile(inputName, data)

    // Normalize: H.264 video at even dims, 30fps; AAC stereo 48kHz audio.
    // For clips that have no audio track, generate silence with anullsrc and
    // use it instead. We try the "with real audio" path first; on failure
    // (e.g. no audio stream), fall back to silent audio.
    try {
      await ff.exec([
        '-i', inputName,
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k',
        '-movflags', '+faststart',
        outName,
      ])
    } catch {
      // Fallback: no audio in source — synthesize silent stereo track.
      await ff.exec([
        '-i', inputName,
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
        '-shortest',
        '-map', '0:v:0', '-map', '1:a:0',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k',
        '-movflags', '+faststart',
        outName,
      ])
    }

    try { await ff.deleteFile(inputName) } catch { /* ignore */ }
    intermediateNames.push(outName)

    onProgress?.({
      ratio: ((i + 1) / urls.length) * 0.85, // reserve 15% for final concat
      clipIndex: i + 1,
      totalClips: urls.length,
    })
  }

  // Stage 2: concat with the demuxer (lossless container join, no re-encode).
  const concatList = intermediateNames.map((n) => `file '${n}'`).join('\n')
  await ff.writeFile('concat.txt', new TextEncoder().encode(concatList))

  await ff.exec([
    '-f', 'concat', '-safe', '0',
    '-i', 'concat.txt',
    '-c', 'copy',
    '-movflags', '+faststart',
    'final.mp4',
  ])

  const out = await ff.readFile('final.mp4')

  // Cleanup intermediate files.
  for (const n of intermediateNames) {
    try { await ff.deleteFile(n) } catch { /* ignore */ }
  }
  try { await ff.deleteFile('concat.txt') } catch { /* ignore */ }
  try { await ff.deleteFile('final.mp4') } catch { /* ignore */ }

  onProgress?.({ ratio: 1, clipIndex: urls.length, totalClips: urls.length })

  const src = out instanceof Uint8Array ? out : new Uint8Array(out as unknown as ArrayBufferLike)
  // Copy into a fresh ArrayBuffer-backed Uint8Array so Blob's typing is happy
  // even when ffmpeg.wasm returns SharedArrayBuffer-backed memory.
  const arr = new Uint8Array(src.byteLength)
  arr.set(src)
  return new Blob([arr.buffer], { type: 'video/mp4' })
}
