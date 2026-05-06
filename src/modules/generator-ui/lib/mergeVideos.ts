// In-browser video concatenation using ffmpeg.wasm.
// Produces a real MP4 (H.264 + AAC) with audio preserved from each clip.
//
// Why ffmpeg.wasm instead of MediaRecorder/canvas:
//  - MediaRecorder cannot produce MP4 in most browsers (only webm).
//  - canvas.captureStream drops audio tracks.
// ffmpeg.wasm gives us a deterministic, real MP4 with audio every time.
//
// Progress strategy (so the UI never sits at 0% for long stretches):
//   0.00 .. 0.05  -> ffmpeg core download + load
//   0.05 .. 0.90  -> per-clip transcode, driven by ffmpeg's own `progress`
//                    event so the bar moves smoothly *during* each clip
//   0.90 .. 1.00  -> concat demuxer pass + readFile

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

export interface MergeProgress {
  /** 0..1 overall progress estimate. */
  ratio: number
  /** 1-based index of the clip currently being processed. */
  clipIndex: number
  totalClips: number
  /** Coarse stage label, useful for diagnostics / UI labels. */
  stage?: 'load' | 'fetch' | 'transcode' | 'concat' | 'done'
}

export type MergeProgressCallback = (p: MergeProgress) => void

let ffmpegInstance: FFmpeg | null = null
let ffmpegLoadPromise: Promise<FFmpeg> | null = null

async function getFFmpeg(onLoadStart?: () => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance
  if (ffmpegLoadPromise) return ffmpegLoadPromise

  onLoadStart?.()
  ffmpegLoadPromise = (async () => {
    const ff = new FFmpeg()
    // Pipe ffmpeg log lines to the console — invaluable when something hangs.
    ff.on('log', ({ message }) => {
      // Keep these as debug so they don't spam the normal console.
      // eslint-disable-next-line no-console
      console.debug('[ffmpeg]', message)
    })

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
    try {
      // eslint-disable-next-line no-console
      console.info('[merge] loading ffmpeg core…')
      await ff.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      // eslint-disable-next-line no-console
      console.info('[merge] ffmpeg core ready')
    } catch (err) {
      ffmpegLoadPromise = null
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`FFmpeg core failed to load: ${msg}`)
    }
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

  const total = urls.length
  const emit = (ratio: number, clipIndex: number, stage: MergeProgress['stage']) => {
    onProgress?.({
      ratio: Math.max(0, Math.min(1, ratio)),
      clipIndex,
      totalClips: total,
      stage,
    })
  }

  // Show life immediately so the ring leaves 0% the instant the user clicks.
  emit(0.01, 1, 'load')

  const ff = await getFFmpeg(() => emit(0.03, 1, 'load'))
  emit(0.05, 1, 'load')

  // Per-clip progress is delivered through ffmpeg's `progress` event. We
  // remap it to the overall ratio range allocated to the current clip.
  let currentClip = 0 // 1-based once we start
  const TRANSCODE_BUDGET = 0.85 // 0.05 .. 0.90
  const onFfProgress = ({ progress }: { progress: number }) => {
    if (currentClip < 1) return
    // ffmpeg sometimes reports progress > 1 right at the end; clamp it.
    const clipRatio = Math.max(0, Math.min(1, progress))
    const overall = 0.05 + ((currentClip - 1 + clipRatio) / total) * TRANSCODE_BUDGET
    emit(overall, currentClip, 'transcode')
  }
  ff.on('progress', onFfProgress)

  const intermediateNames: string[] = []
  try {
    // Stage 1: download + transcode each clip to a normalized intermediate MP4
    // (same codec, fps, sample rate, audio layout). Concat demuxer requires
    // matching streams across inputs.
    for (let i = 0; i < total; i++) {
      currentClip = i + 1
      const url = urls[i]
      const inputName = `in_${i}.${extFromUrl(url)}`
      const outName = `seg_${i}.mp4`

      // eslint-disable-next-line no-console
      console.info(`[merge] fetching clip ${currentClip}/${total}`)
      emit(0.05 + (i / total) * TRANSCODE_BUDGET, currentClip, 'fetch')

      const data = await fetchFile(url)
      await ff.writeFile(inputName, data)

      // eslint-disable-next-line no-console
      console.info(`[merge] transcoding clip ${currentClip}/${total}`)

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

      // Snap to the end of this clip's slice in case ffmpeg's progress event
      // didn't quite reach 1.0.
      emit(0.05 + ((i + 1) / total) * TRANSCODE_BUDGET, currentClip, 'transcode')
    }

    // Stage 2: concat with the demuxer (lossless container join, no re-encode).
    // eslint-disable-next-line no-console
    console.info('[merge] concatenating segments')
    emit(0.92, total, 'concat')
    const concatList = intermediateNames.map((n) => `file '${n}'`).join('\n')
    await ff.writeFile('concat.txt', new TextEncoder().encode(concatList))

    await ff.exec([
      '-f', 'concat', '-safe', '0',
      '-i', 'concat.txt',
      '-c', 'copy',
      '-movflags', '+faststart',
      'final.mp4',
    ])

    emit(0.97, total, 'concat')
    const out = await ff.readFile('final.mp4')

    // Cleanup intermediate files.
    for (const n of intermediateNames) {
      try { await ff.deleteFile(n) } catch { /* ignore */ }
    }
    try { await ff.deleteFile('concat.txt') } catch { /* ignore */ }
    try { await ff.deleteFile('final.mp4') } catch { /* ignore */ }

    const src = out instanceof Uint8Array ? out : new Uint8Array(out as unknown as ArrayBufferLike)
    // Copy into a fresh ArrayBuffer-backed Uint8Array so Blob's typing is happy
    // even when ffmpeg.wasm returns SharedArrayBuffer-backed memory.
    const arr = new Uint8Array(src.byteLength)
    arr.set(src)
    const blob = new Blob([arr.buffer], { type: 'video/mp4' })
    emit(1, total, 'done')
    // eslint-disable-next-line no-console
    console.info('[merge] done', { bytes: blob.size })
    return blob
  } finally {
    // Detach the progress listener so it doesn't bleed into a future merge
    // and report stale clip indices.
    try { ff.off('progress', onFfProgress) } catch { /* ignore */ }
  }
}
