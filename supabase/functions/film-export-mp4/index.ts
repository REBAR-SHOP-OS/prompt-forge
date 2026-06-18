// Server-side MP4 export for Final Films.
//
// Final Films are recorded in the browser as WebM (MediaRecorder). WebM does
// not play in QuickTime / Windows Media Player / the iOS gallery, and the old
// in-browser ffmpeg.wasm transcode was slow and frequently hung/OOMed, so
// "Download as MP4" looked broken. This function does the conversion on the
// backend instead:
//
//   1. Validate the caller and confirm they own the Final Film asset.
//   2. If a finished MP4 export already exists, return it immediately (cached).
//   3. Otherwise mark an export row "processing", return 202, and transcode in
//      the background (EdgeRuntime.waitUntil): download the WebM, run it through
//      ffmpeg.wasm to H.264/AAC MP4 (+faststart), upload to merged-videos, and
//      update the row to "completed" (or "failed" with an error).
//
// The client polls the generator_film_exports row and downloads the finished
// MP4 via a signed URL.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
// @ts-ignore - Emscripten factory, no types in Deno
import createFFmpegCore from 'npm:@ffmpeg/core@0.12.6'

const MERGED_BUCKET = 'merged-videos'
const CORE_JS_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js'
const CORE_WASM_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function svc() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}

// Parse "<bucket>/<path>" out of a stored URL or a bare storage path.
function parseStoragePath(raw: string): { bucket: string; path: string } | null {
  if (!raw) return null
  // Full URL form: …/storage/v1/object/(public/|sign/|authenticated/)?<bucket>/<path>
  const m = raw.match(/\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?([^/]+)\/(.+?)(?:\?|$)/)
  if (m) {
    let path = m[2]
    try { path = decodeURIComponent(path) } catch { /* keep raw */ }
    return { bucket: m[1], path }
  }
  // Bare "bucket/path" form.
  const slash = raw.indexOf('/')
  if (slash > 0) {
    return { bucket: raw.slice(0, slash), path: raw.slice(slash + 1) }
  }
  return null
}

let corePromise: Promise<any> | null = null
async function getCore(): Promise<any> {
  if (!corePromise) {
    corePromise = (async () => {
      // Deno's edge runtime resolves Emscripten's locateFile against the
      // filesystem, so we fetch the wasm ourselves and hand the bytes in via
      // `wasmBinary`, bypassing all file/URL loading inside the core.
      const wasmResp = await fetch(CORE_WASM_URL)
      if (!wasmResp.ok) throw new Error(`failed to fetch ffmpeg-core.wasm: ${wasmResp.status}`)
      const wasmBinary = new Uint8Array(await wasmResp.arrayBuffer())
      return await createFFmpegCore({ wasmBinary })
    })()
  }
  return corePromise
}


async function transcodeToMp4(input: Uint8Array): Promise<Uint8Array> {
  const core = await getCore()
  const inName = 'input.webm'
  const outName = 'output.mp4'
  try {
    core.FS.writeFile(inName, input)
    // H.264 + AAC, +faststart for instant playback / broad compatibility.
    const args = [
      '-i', inName,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', '192k',
      outName,
    ]
    // @ffmpeg/core API: exec(...args), result code in `ret`, then reset().
    core.setTimeout?.(-1)
    core.exec(...args)
    const ret = core.ret
    core.reset?.()
    if (ret && ret !== 0) {
      throw new Error(`ffmpeg exited with code ${ret}`)
    }
    const out = core.FS.readFile(outName)
    if (!out || out.length === 0) throw new Error('ffmpeg produced an empty file')
    return out
  } finally {
    try { core.FS.unlink(inName) } catch { /* ignore */ }
    try { core.FS.unlink(outName) } catch { /* ignore */ }
  }
}


async function runExport(params: {
  exportId: string
  bucket: string
  path: string
}) {
  const client = svc()
  const { exportId, bucket, path } = params
  try {
    const { data: file, error: dlErr } = await client.storage.from(bucket).download(path)
    if (dlErr || !file) throw new Error(`download failed: ${dlErr?.message ?? 'no file'}`)
    const input = new Uint8Array(await file.arrayBuffer())

    const mp4 = await transcodeToMp4(input)

    const mp4Path = `${path.replace(/\.[^/.]+$/, '')}-export.mp4`
    const { error: upErr } = await client.storage
      .from(bucket)
      .upload(mp4Path, mp4, { contentType: 'video/mp4', upsert: true })
    if (upErr) throw new Error(`upload failed: ${upErr.message}`)

    await client
      .from('generator_film_exports')
      .update({ status: 'completed', mp4_storage_path: `${bucket}/${mp4Path}`, error_message: null })
      .eq('id', exportId)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[film-export-mp4] transcode failed:', message)
    await client
      .from('generator_film_exports')
      .update({ status: 'failed', error_message: message.slice(0, 500) })
      .eq('id', exportId)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // Authenticate the caller from the JWT.
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'missing authorization' }, 401)

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  const user = userData?.user
  if (userErr || !user) return json({ error: 'unauthorized' }, 401)

  let body: { assetId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }
  const assetId = body.assetId
  if (!assetId || typeof assetId !== 'string') {
    return json({ error: 'assetId is required' }, 400)
  }

  const client = svc()

  // Confirm the asset belongs to the caller and read its storage path.
  const { data: asset, error: assetErr } = await client
    .from('generator_video_assets')
    .select('id, user_id, storage_path')
    .eq('id', assetId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (assetErr) return json({ error: 'lookup failed' }, 500)
  if (!asset) return json({ error: 'asset not found' }, 404)

  const parsed = parseStoragePath(asset.storage_path)
  if (!parsed) return json({ error: 'unsupported storage path' }, 422)

  // Reuse a finished export if the MP4 is still present.
  const { data: existing } = await client
    .from('generator_film_exports')
    .select('id, status, mp4_storage_path')
    .eq('user_id', user.id)
    .eq('source_asset_id', assetId)
    .maybeSingle()

  if (existing?.status === 'completed' && existing.mp4_storage_path) {
    return json({ status: 'completed', exportId: existing.id, mp4Path: existing.mp4_storage_path })
  }

  // Upsert a processing row (resets a previous failed attempt).
  const { data: row, error: upsertErr } = await client
    .from('generator_film_exports')
    .upsert(
      {
        user_id: user.id,
        source_asset_id: assetId,
        source_storage_path: asset.storage_path,
        status: 'processing',
        mp4_storage_path: null,
        error_message: null,
      },
      { onConflict: 'user_id,source_asset_id' },
    )
    .select('id')
    .single()
  if (upsertErr || !row) return json({ error: 'could not create export' }, 500)

  // @ts-ignore - EdgeRuntime is provided by the edge runtime
  EdgeRuntime.waitUntil(runExport({ exportId: row.id, bucket: parsed.bucket, path: parsed.path }))

  return json({ status: 'processing', exportId: row.id }, 202)
})
