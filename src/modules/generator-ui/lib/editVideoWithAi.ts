// Video-to-Video editing via per-frame AI edits.
//
// Uses an ISOLATED FFmpeg worker per job (not the shared singleton) so a heap
// that fragments during long extract/encode runs can't poison other features
// (trim, Final Film, etc.) — and vice versa. The worker is terminated at the
// end of every job, success or failure, so the next run starts clean.
//
// Extraction is two-tiered: a normal pass first, then a low-memory retry on a
// fresh worker if the first pass hits `memory access out of bounds`, which is
// a known ffmpeg.wasm issue on some inputs (see upstream issues #673, #820,
// #823). Same retry strategy covers the encode step.

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import { supabase } from '@/integrations/supabase/client'
import { createIsolatedFFmpeg, stringifyAny } from './transcodeToMp4'

export interface EditVideoOptions {
  prompt: string
  /** Frames per second to sample/output. Default 4. */
  fps?: number
  /** Max input duration in seconds. Default 6. */
  maxDurationSec?: number
  /** Parallel API calls. Default 3 (gateway rate-limit friendly). */
  concurrency?: number
  onProgress?: (info: {
    stage: 'loading' | 'extracting' | 'editing' | 'encoding'
    /** 0..1 for current stage */
    ratio: number
    /** When stage==='editing', current/total frame counts */
    done?: number
    total?: number
  }) => void
}

export interface EditVideoResult {
  blob: Blob
  mimeType: 'video/mp4'
  extension: 'mp4'
  duration: number
}

async function runStage<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    throw new Error(`video-edit ${label} failed: ${stringifyAny(e)}`)
  }
}

function dataUrlFromBytes(bytes: Uint8Array, mime: string): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return `data:${mime};base64,${btoa(bin)}`
}

async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  const comma = dataUrl.indexOf(',')
  const b64 = dataUrl.slice(comma + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function editFrameViaGateway(dataUrl: string, prompt: string): Promise<string> {
  const timeoutMs = 30_000
  const result = await Promise.race([
    supabase.functions.invoke('ai-image-edit', { body: { imageUrl: dataUrl, prompt } }),
    new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: `ai-image-edit timed out after ${timeoutMs}ms` } }), timeoutMs),
    ),
  ])
  const { data, error } = result as { data: { dataUrl?: string; error?: string } | null; error: { message?: string } | null }
  if (error) throw new Error(error.message || 'AI edit failed')
  const out = data?.dataUrl
  if (!out) throw new Error(data?.error || 'AI returned no image')
  return out
}

async function pool<T>(items: T[], concurrency: number, worker: (t: T, i: number) => Promise<void>) {
  let cursor = 0
  const runners: Promise<void>[] = []
  const n = Math.max(1, Math.min(concurrency, items.length))
  for (let k = 0; k < n; k++) {
    runners.push((async () => {
      while (true) {
        const i = cursor++
        if (i >= items.length) return
        await worker(items[i], i)
      }
    })())
  }
  await Promise.all(runners)
}

interface ExtractPreset {
  /** Max width OR height in px; whichever side is larger gets clamped. */
  maxSide: number
  /** JPEG quality (FFmpeg -q:v, lower = better, 2..15). */
  q: number
  fps: number
  maxDur: number
}

/** Build extraction args that cap BOTH axes — vertical clips were the failing case. */
function buildExtractArgs(p: ExtractPreset): string[] {
  // scale=if(gt(iw,ih),min(maxSide,iw),-2):if(gt(iw,ih),-2,min(maxSide,ih))
  // i.e. clamp the longer side to maxSide, keep aspect, ensure even dims.
  const vf =
    `fps=${p.fps},` +
    `scale='if(gt(iw,ih),min(${p.maxSide},iw),-2)':'if(gt(iw,ih),-2,min(${p.maxSide},ih))'`
  return [
    '-i', 'src.mp4',
    '-an',            // drop audio — we don't need it for frame extraction
    '-sn',            // drop subtitles
    '-t', String(p.maxDur),
    '-vf', vf,
    '-q:v', String(p.q),
    'f_%03d.jpg',
  ]
}

/** Try to extract; on memory-access / generic failure, rebuild worker + downscale. */
async function extractWithRetry(
  initial: FFmpeg,
  srcBytes: Uint8Array,
  preset: ExtractPreset,
): Promise<{ ff: FFmpeg; files: { name: string }[] }> {
  const attempts: ExtractPreset[] = [
    preset,
    { ...preset, maxSide: 480, q: 6 },
    { ...preset, maxSide: 360, q: 8, fps: Math.min(preset.fps, 3) },
  ]

  let ff = initial
  let lastErr: unknown = null
  for (let i = 0; i < attempts.length; i++) {
    const p = attempts[i]
    try {
      if (i > 0) {
        // Fresh worker — previous heap is suspect.
        try { ff.terminate() } catch { /* ignore */ }
        ff = await createIsolatedFFmpeg()
      }
      await ff.writeFile('src.mp4', srcBytes)
      await ff.exec(buildExtractArgs(p))
      const allFiles = await ff.listDir('/')
      const files = allFiles
        .filter((f) => /^f_\d{3}\.jpg$/.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name))
      if (files.length === 0) {
        throw new Error('produced 0 frames')
      }
      return { ff, files }
    } catch (e) {
      lastErr = e
      console.warn(`[editVideoWithAi] extract attempt ${i + 1} failed (maxSide=${p.maxSide}):`, stringifyAny(e))
      // Clean up FS so the next attempt starts fresh.
      try {
        const all = await ff.listDir('/')
        for (const f of all) {
          if (/^f_\d{3}\.jpg$/.test(f.name) || f.name === 'src.mp4') {
            try { await ff.deleteFile(f.name) } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }
  }
  throw new Error(
    `Could not extract frames from this video after ${attempts.length} attempts. ` +
      `The in-browser video engine ran out of memory. Try a shorter or lower-resolution clip. ` +
      `(${stringifyAny(lastErr)})`,
  )
}

export async function editVideoWithAi(
  sourceUrl: string,
  opts: EditVideoOptions,
): Promise<EditVideoResult> {
  const fps = Math.max(2, Math.min(10, opts.fps ?? 4))
  const maxDur = Math.max(1, Math.min(15, opts.maxDurationSec ?? 6))
  const concurrency = Math.max(1, Math.min(6, opts.concurrency ?? 3))
  const prompt = opts.prompt.trim()
  if (!prompt) throw new Error('Prompt is required')

  opts.onProgress?.({ stage: 'loading', ratio: 0 })
  let ff = await runStage('load ffmpeg', () => createIsolatedFFmpeg())
  opts.onProgress?.({ stage: 'loading', ratio: 1 })

  try {
    const srcBytes = await runStage('fetch source', () => fetchFile(sourceUrl))

    opts.onProgress?.({ stage: 'extracting', ratio: 0 })
    const extracted = await extractWithRetry(ff, srcBytes, {
      maxSide: 720,
      q: 4,
      fps,
      maxDur,
    })
    ff = extracted.ff
    const files = extracted.files
    opts.onProgress?.({ stage: 'extracting', ratio: 1 })

    let done = 0
    opts.onProgress?.({ stage: 'editing', ratio: 0, done, total: files.length })

    const editPrompt = `${prompt}. Preserve composition, camera angle, subject identity and framing. Output ONLY the edited image.`

    // Keep edited bytes in JS memory in case the encode step needs a fresh worker.
    const editedFrames: Uint8Array[] = new Array(files.length)

    await pool(files, concurrency, async (file, i) => {
      const bytes = (await ff.readFile(file.name)) as Uint8Array
      const inputUrl = dataUrlFromBytes(bytes, 'image/jpeg')
      let outDataUrl: string
      try {
        outDataUrl = await editFrameViaGateway(inputUrl, editPrompt)
      } catch (e) {
        console.warn('[editVideoWithAi] frame edit failed, keeping original', file.name, stringifyAny(e))
        outDataUrl = inputUrl
      }
      const outBytes = await dataUrlToBytes(outDataUrl)
      await ff.writeFile(file.name, outBytes)
      editedFrames[i] = outBytes
      done += 1
      opts.onProgress?.({ stage: 'editing', ratio: done / files.length, done, total: files.length })
    })

    opts.onProgress?.({ stage: 'encoding', ratio: 0 })
    const encodeArgs = [
      '-framerate', String(fps),
      '-i', 'f_%03d.jpg',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-r', String(fps),
      '-threads', '1',
      '-movflags', '+faststart',
      'out.mp4',
    ]
    try {
      await runStage('encode', () => ff.exec(encodeArgs))
    } catch (e1) {
      console.warn('[editVideoWithAi] encode failed, rebuilding worker and retrying:', stringifyAny(e1))
      try { ff.terminate() } catch { /* ignore */ }
      ff = await runStage('reload ffmpeg', () => createIsolatedFFmpeg())
      for (let i = 0; i < files.length; i++) {
        await ff.writeFile(files[i].name, editedFrames[i])
      }
      await runStage('encode (retry)', () => ff.exec(encodeArgs))
    }
    const outData = (await runStage('readFile out', () => ff.readFile('out.mp4'))) as Uint8Array
    opts.onProgress?.({ stage: 'encoding', ratio: 1 })

    const ab = new ArrayBuffer(outData.byteLength)
    new Uint8Array(ab).set(outData)
    const blob = new Blob([ab], { type: 'video/mp4' })
    const duration = Math.min(maxDur, files.length / fps)
    return { blob, mimeType: 'video/mp4', extension: 'mp4', duration }
  } finally {
    // Always tear down the isolated worker so its heap is fully released.
    try { ff.terminate() } catch { /* ignore */ }
  }
}
