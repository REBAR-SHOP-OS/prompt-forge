// Video-to-Video editing via per-frame AI edits.
//
// Uses the shared ffmpeg loader from transcodeToMp4 (with local → unpkg
// fallback + timeouts) so a broken local @ffmpeg/core URL can't leave the
// dialog stuck on "Preparing… 0%". Every stage is wrapped so failures
// surface as real, readable error messages.

import { fetchFile } from '@ffmpeg/util'
import { supabase } from '@/integrations/supabase/client'
import { getFFmpeg, resetFFmpeg, stringifyAny } from './transcodeToMp4'

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
  // 30s soft timeout per frame so a hung gateway call doesn't stall the whole job.
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
  let ff = await runStage('load ffmpeg', () => getFFmpeg())
  opts.onProgress?.({ stage: 'loading', ratio: 1 })

  // Fetch source as bytes
  const srcBytes = await runStage('fetch source', () => fetchFile(sourceUrl))
  await runStage('writeFile src', () => ff.writeFile('src.mp4', srcBytes))

  // Extract frames (capped at maxDur)
  opts.onProgress?.({ stage: 'extracting', ratio: 0 })
  await runStage('extract frames', () => ff.exec([
    '-i', 'src.mp4',
    '-t', String(maxDur),
    '-vf', `fps=${fps},scale='min(720,iw)':-2`,
    '-q:v', '4',
    'f_%03d.jpg',
  ]))

  const allFiles = await runStage('listDir', () => ff.listDir('/'))
  const files = allFiles
    .filter((f) => /^f_\d{3}\.jpg$/.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (files.length === 0) {
    throw new Error('No frames could be extracted from this video. Try a shorter or different clip.')
  }
  opts.onProgress?.({ stage: 'extracting', ratio: 1 })

  let done = 0
  opts.onProgress?.({ stage: 'editing', ratio: 0, done, total: files.length })

  const editPrompt = `${prompt}. Preserve composition, camera angle, subject identity and framing. Output ONLY the edited image.`

  // Keep edited frame bytes in JS memory so we can re-hydrate the ffmpeg FS
  // if the encode step fails and we have to reset the worker.
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
    '-movflags', '+faststart',
    'out.mp4',
  ]
  try {
    await runStage('encode', () => ff.exec(encodeArgs))
  } catch (e1) {
    console.warn('[editVideoWithAi] encode failed, resetting and retrying:', stringifyAny(e1))
    ff = await runStage('reset ffmpeg', () => resetFFmpeg())
    // FS was wiped by reset — re-write every frame from the in-memory copy.
    for (let i = 0; i < files.length; i++) {
      await ff.writeFile(files[i].name, editedFrames[i])
    }
    await runStage('encode (retry)', () => ff.exec(encodeArgs))
  }
  const outData = (await runStage('readFile out', () => ff.readFile('out.mp4'))) as Uint8Array

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
