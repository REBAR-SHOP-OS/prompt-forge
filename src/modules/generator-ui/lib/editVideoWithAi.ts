// Video-to-Video editing via per-frame AI edits.
//
// Pipeline (entirely client-side except per-frame API calls):
//   1. Load source MP4 with ffmpeg.wasm
//   2. Extract frames at low fps (default 6) into JPEG files
//   3. For each frame: POST data-URL to `ai-image-edit` edge function
//      with the user's prompt (concurrency-limited)
//   4. Write edited frames back, re-encode to MP4 (silent — audio is hard
//      to keep coherent under heavy visual edits anyway)
//   5. Return the resulting Blob
//
// Hard caps keep cost + runtime bounded:
//   - input duration: 8s
//   - output fps:     6
//   => max ~48 API calls per edit.

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
// eslint-disable-next-line import/no-unresolved
import coreUrl from '@ffmpeg/core?url'
// eslint-disable-next-line import/no-unresolved
import wasmUrl from '@ffmpeg/core/wasm?url'
import { supabase } from '@/integrations/supabase/client'

export interface EditVideoOptions {
  prompt: string
  /** Frames per second to sample/output. Default 6. */
  fps?: number
  /** Max input duration in seconds. Default 8. */
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

let ffmpegSingleton: FFmpeg | null = null
async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegSingleton) return ffmpegSingleton
  const ff = new FFmpeg()
  const [core, wasm] = await Promise.all([
    toBlobURL(coreUrl, 'text/javascript'),
    toBlobURL(wasmUrl, 'application/wasm'),
  ])
  await ff.load({ coreURL: core, wasmURL: wasm })
  ffmpegSingleton = ff
  return ff
}

function dataUrlFromBytes(bytes: Uint8Array, mime: string): string {
  // Convert in chunks so we don't blow the call stack for big frames.
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

async function editFrameViaGateway(dataUrl: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ai-image-edit', {
    body: { imageUrl: dataUrl, prompt },
  })
  if (signal?.aborted) throw new Error('cancelled')
  if (error) {
    const msg = (error as { message?: string })?.message ?? 'AI edit failed'
    throw new Error(msg)
  }
  const out = (data as { dataUrl?: string; error?: string })?.dataUrl
  if (!out) {
    const e = (data as { error?: string })?.error
    throw new Error(e || 'AI returned no image')
  }
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

export async function editVideoWithAi(
  sourceUrl: string,
  opts: EditVideoOptions,
): Promise<EditVideoResult> {
  const fps = Math.max(2, Math.min(10, opts.fps ?? 6))
  const maxDur = Math.max(1, Math.min(15, opts.maxDurationSec ?? 8))
  const concurrency = Math.max(1, Math.min(6, opts.concurrency ?? 3))
  const prompt = opts.prompt.trim()
  if (!prompt) throw new Error('Prompt is required')

  opts.onProgress?.({ stage: 'loading', ratio: 0 })
  const ff = await getFFmpeg()

  // Fetch source as bytes
  const srcBytes = await fetchFile(sourceUrl)
  await ff.writeFile('src.mp4', srcBytes)

  // Extract frames (capped at maxDur) into f_001.jpg, f_002.jpg ...
  opts.onProgress?.({ stage: 'extracting', ratio: 0 })
  await ff.exec([
    '-i', 'src.mp4',
    '-t', String(maxDur),
    '-vf', `fps=${fps},scale='min(720,iw)':-2`,
    '-q:v', '4',
    'f_%03d.jpg',
  ])

  // List how many frames were produced
  const files = (await ff.listDir('/')).filter((f) => /^f_\d{3}\.jpg$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name))
  if (files.length === 0) throw new Error('Could not extract frames from this video.')
  opts.onProgress?.({ stage: 'extracting', ratio: 1 })

  // Edit each frame
  let done = 0
  opts.onProgress?.({ stage: 'editing', ratio: 0, done, total: files.length })

  const editPrompt = `${prompt}. Preserve composition, camera angle, subject identity and framing. Output ONLY the edited image.`

  await pool(files, concurrency, async (file) => {
    const bytes = (await ff.readFile(file.name)) as Uint8Array
    const inputUrl = dataUrlFromBytes(bytes, 'image/jpeg')
    let outDataUrl: string
    try {
      outDataUrl = await editFrameViaGateway(inputUrl, editPrompt)
    } catch (e) {
      // If a single frame fails, keep the original frame to avoid full failure.
      console.warn('[editVideoWithAi] frame edit failed, keeping original', file.name, e)
      outDataUrl = inputUrl
    }
    const outBytes = await dataUrlToBytes(outDataUrl)
    // Overwrite the frame file (could be png or jpeg from AI — ffmpeg auto-detects)
    await ff.writeFile(file.name, outBytes)
    done += 1
    opts.onProgress?.({ stage: 'editing', ratio: done / files.length, done, total: files.length })
  })

  // Re-encode the frames into MP4
  opts.onProgress?.({ stage: 'encoding', ratio: 0 })
  await ff.exec([
    '-framerate', String(fps),
    '-i', 'f_%03d.jpg',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-movflags', '+faststart',
    'out.mp4',
  ])
  const outData = (await ff.readFile('out.mp4')) as Uint8Array

  // Cleanup
  try { await ff.deleteFile('src.mp4') } catch { /* noop */ }
  try { await ff.deleteFile('out.mp4') } catch { /* noop */ }
  for (const f of files) {
    try { await ff.deleteFile(f.name) } catch { /* noop */ }
  }
  opts.onProgress?.({ stage: 'encoding', ratio: 1 })

  const ab = new ArrayBuffer(outData.byteLength)
  new Uint8Array(ab).set(outData)
  const blob = new Blob([ab], { type: 'video/mp4' })
  const duration = Math.min(maxDur, files.length / fps)
  return { blob, mimeType: 'video/mp4', extension: 'mp4', duration }
}
