# Reliable server-side MP4 export for Final Films

## Goal
"Download as MP4" must always produce a real, broadly-compatible MP4 (H.264 + AAC), without depending on the user's browser/device. Today it transcodes WebM → MP4 in the browser with ffmpeg.wasm, which is slow, can hang ~45–90s, and silently OOMs — so it looks like nothing happens. "Download as WEBM" works only because it streams the stored file directly.

## Approach
Move the conversion to the backend using an async job pattern: the client requests an MP4 export, the backend transcodes the stored WebM and saves a real `.mp4` next to it, then the client downloads that file directly. Re-downloads are instant because the MP4 is cached.

```text
Click "Download as MP4"
   │
   ▼
edge fn: film-export-mp4 ── (already have mp4?) ──► return ready + path
   │ no
   ├─ create export row (status=processing), return 202
   │
   └─ background (EdgeRuntime.waitUntil):
         fetch source webm from storage
         transcode → H.264/AAC mp4 (+faststart)
         upload mp4 to merged-videos
         update row: status=completed, mp4_path  (or failed, error)
   ▲
client polls export row (RLS-protected) ──► when completed: signed-URL download of the mp4
```

## Steps

### 1. Database (migration)
- New table `public.generator_film_exports`:
  - `user_id` (owner), `source_asset_id` (the Final Film `generator_video_assets.id`), `source_storage_path`, `mp4_storage_path` (nullable), `status` (`processing`/`completed`/`failed`), `error_message` (nullable), standard id/created_at/updated_at.
  - Unique-ish lookup on `(user_id, source_asset_id)` so we reuse a finished export.
- GRANTs: `authenticated` (select/insert/update/delete scoped to owner), `service_role` ALL. No `anon`.
- RLS: users can only see/manage their own rows; the edge function writes via service role.
- `updated_at` trigger.

### 2. Edge function `film-export-mp4`
- Validate JWT in code, parse `{ assetId }` with zod.
- Confirm the asset belongs to the caller and read its `storage_path`.
- If a completed export already exists with a valid `mp4_storage_path`, return it immediately (`status: "completed"`).
- Otherwise upsert a `processing` row, return **202** immediately, and run the transcode in `EdgeRuntime.waitUntil`:
  - Download the source from the `merged-videos` bucket (service role).
  - Transcode to standard MP4 (H.264 video, AAC audio, `+faststart`).
  - Upload to `merged-videos` as `<original>-mp4/<id>.mp4`.
  - Update the row to `completed` with the path, or `failed` with the error.
- All responses include CORS headers.

### 3. Client (`DashboardPage.tsx`)
- Rewrite `downloadAsMp4` to:
  - Call `supabase.functions.invoke('film-export-mp4', { assetId })`.
  - If `completed`, immediately download the MP4 via a signed URL (reuse existing `downloadDirect` logic).
  - If `processing`, poll the `generator_film_exports` row every ~2s (with a sensible timeout) while showing live toast feedback ("Converting to MP4…"), then download when `completed`.
  - On `failed`/timeout, show a clear error toast and offer the WEBM download as fallback.
- Keep the existing spinner on the download icon during the wait.
- Remove the in-browser ffmpeg.wasm path from the download flow (the `transcodeToMp4` lib stays in the repo but is no longer used for downloads).
- "Download as WEBM" stays exactly as-is.

## Technical notes / risks
- Reels/Final Films are short, so file sizes are modest; transcoding fits within an edge function. If a very long/large film exceeds backend memory/time, the row is marked `failed` and the user is offered the WEBM download — never left with a broken/empty result.
- The MP4 is cached per Final Film, so the first download does the work and later ones are instant.
- No changes to the Final Film generation pipeline (still records WebM); only the download path changes.
- Backend transcode runs as `service_role`; ownership is verified before any work starts.
