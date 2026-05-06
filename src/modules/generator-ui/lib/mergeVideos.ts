// In-browser video concatenation using ffmpeg.wasm.
// Output is ALWAYS a real MP4 (H.264 + AAC) blob — required by product spec.
//
// Strategy (fast path first):
//   1. Try the "concat demuxer + -c copy" path — no re-encode, just stitches
//      the existing MP4 streams together. This is orders of magnitude faster
//      than transcoding and is what makes the merge feel near-instant when
//      the clips share the same codec/dimensions (which is the normal case
//      because every clip comes from the same generator).
//   2. Only if that fails (mismatched codecs, missing audio, etc.) fall back
//      to a full normalize+re-encode pass per clip.
//
// Progress allocation:
//   0.00 .. 0.05  -> ffmpeg core load
//   0.05 .. 0.20  -> fetch clips into the wasm FS
//   0.20 .. 0.90  -> concat (fast) OR per-clip transcode (fallback)
//   0.90 .. 1.00  -> read final mp4 + wrap as Blob

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

export interface MergeProgress {
  /** 0..1 overall progress estimate. */
  ratio: number
  /** 1-based index of the clip currently being processed. */
  clipIndex: number
  totalClips: number
  /** Coarse stage label, useful for diagnostics / UI labels. */
  stage?: 'load' | 'fetch' | 'concat' | 'transcode' | 'done'
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
    ff.on('log', ({ message }) => {
      // eslint-disable-next-line no-console
      console.debug('[ffmpeg]', message)
    })

    // Single-thread ESM core — works without cross-origin isolation headers
    // and is what the ffmpeg.wasm docs recommend for Vite apps.
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm'
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
 * Merge multiple video URLs into a single MP4 blob (H.264 + AAC).
 * Tries a fast stream-copy concat first; falls back to a normalize pass
 * only when that fails.
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

  // Hook ffmpeg progress for the (slow) fallback path.
  let transcodeClip = 0
  const TRANSCODE_BUDGET = 0.70 // 0.20 .. 0.90 reserved for processing
  const onFfProgress = ({ progress }: { progress: number }) => {
    if (transcodeClip < 1) return
    const clipRatio = Math.max(0, Math.min(1, progress))
    const overall = 0.20 + ((transcodeClip - 1 + clipRatio) / total) * TRANSCODE_BUDGET
    emit(overall, transcodeClip, 'transcode')
  }
  ff.on('progress', onFfProgress)

  const writtenInputs: string[] = []
  try {
    // ---- Fetch all clips into the wasm FS (0.05 .. 0.20) -----------------
    for (let i = 0; i < total; i++) {
      const url = urls[i]
      const inputName = `in_${i}.${extFromUrl(url)}`
      // eslint-disable-next-line no-console
      console.info(`[merge] fetching clip ${i + 1}/${total}`)
      emit(0.05 + ((i + 0.5) / total) * 0.15, i + 1, 'fetch')
      const data = await fetchFile(url)
      await ff.writeFile(inputName, data)
      writtenInputs.push(inputName)
      emit(0.05 + ((i + 1) / total) * 0.15, i + 1, 'fetch')
    }

    // ---- FAST PATH: concat demuxer with -c copy --------------------------
    // Works when every clip already shares the same codec/timescale, which
    // is the normal case here (all clips come from the same generator).
    const concatList = writtenInputs.map((n) => `file '${n}'`).join('\n')
    await ff.writeFile('concat.txt', new TextEncoder().encode(concatList))

    // eslint-disable-next-line no-console
    console.info('[merge] fast concat (stream copy)…')
    emit(0.25, total, 'concat')

    let fastOk = true
    try {
      await ff.exec([
        '-f', 'concat', '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        '-movflags', '+faststart',
        'final.mp4',
      ])
      emit(0.88, total, 'concat')
    } catch (err) {
      fastOk = false
      // eslint-disable-next-line no-console
      console.warn('[merge] fast concat failed, falling back to transcode', err)
    }

    // ---- FALLBACK: per-clip normalize then concat-copy -------------------
    if (!fastOk) {
      const segNames: string[] = []
      for (let i = 0; i < writtenInputs.length; i++) {
        transcodeClip = i + 1
        const inputName = writtenInputs[i]
        const outName = `seg_${i}.mp4`
        // eslint-disable-next-line no-console
        console.info(`[merge] normalizing clip ${transcodeClip}/${total}`)
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
          // Source has no audio — synthesize a silent track so concat stays
          // in sync.
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
        segNames.push(outName)
        emit(0.20 + ((i + 1) / total) * TRANSCODE_BUDGET, transcodeClip, 'transcode')
      }

      const segList = segNames.map((n) => `file '${n}'`).join('\n')
      await ff.writeFile('concat.txt', new TextEncoder().encode(segList))
      emit(0.92, total, 'concat')
      await ff.exec([
        '-f', 'concat', '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        '-movflags', '+faststart',
        'final.mp4',
      ])

      for (const n of segNames) {
        try { await ff.deleteFile(n) } catch { /* ignore */ }
      }
    }

    // ---- Read out + return as Blob (0.90 .. 1.00) ------------------------
    emit(0.95, total, 'concat')
    const out = await ff.readFile('final.mp4')

    for (const n of writtenInputs) {
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
    try { ff.off('progress', onFfProgress) } catch { /* ignore */ }
  }
}
