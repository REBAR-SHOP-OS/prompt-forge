# Plan: Store large files on Synology

## Goal
Large files (any file over a size threshold, across every category — final videos, MP4 exports, source images/frames, audio) are stored on the Synology NAS instead of Lovable Cloud storage. Files are read back by streaming through an authenticated backend proxy. Existing files are migrated to the NAS. If the NAS is unreachable, operations fail with a clear error — never a silent fallback.

## How it works

```text
UPLOAD (large file)                    READ / DOWNLOAD
 client → synology-storage-upload       client → synology-storage-stream?id=...
        → SFTP write to NAS                    → validate JWT + ownership
        → record row in storage_objects        → SFTP read stream (Range-aware)
 small file → stays in Lovable Cloud            → piped back as 200/206 response
```

A single `resolveAsset()` helper decides per file: **size ≥ threshold → Synology**, otherwise Cloud. Every stored file gets a row describing where it actually lives, so reads always know the correct source.

## Pieces to build

### 1. Pointer table — `storage_objects`
Tracks every managed file: `user_id`, `logical_bucket` (user-videos / merged-videos / user-images / wan-frames / user-audio / mp4-exports), `object_key`, `backend` ('cloud' | 'synology'), `nas_path`, `size_bytes`, `content_type`, `status` ('active' | 'migrating' | 'failed'). Owner-scoped SELECT; all writes via service role only (restrictive deny on client insert/update/delete), matching the `mp4_export_jobs` pattern. GRANTs for `authenticated` (select) and `service_role` (all).

### 2. SFTP helpers in `_shared/synology-ssh.ts`
Add `sftp(conn)`, `sftpMkdirP(conn, dir)`, `sftpWriteStream`/`sftpPut(conn, path, bytes)`, and `sftpReadStream(conn, path, {start,end})` for range reads. Base path `/volume1/ERP/media/<userId>/<bucket>/<key>` (configurable via `SYNOLOGY_MEDIA_PATH`, default `/volume1/ERP/media`). Per `skill/synology-nas-access`: use SFTP streams, never `cat`/`base64` over exec.

### 3. Edge functions
- **`synology-storage-upload`** — validates JWT + ownership, `sftpMkdirP` then streams bytes to the NAS, inserts the `storage_objects` row. Returns the object id. On any NAS error: mark/skip row and return a clear `STORAGE_UNAVAILABLE` error (no Cloud fallback).
- **`synology-storage-stream`** — validates JWT + ownership, honors the `Range` header, opens an SFTP read stream and pipes it back with correct `Content-Type`, `Content-Length`/`Content-Range`, `Accept-Ranges: bytes` (200 or 206). This is what `<video>`/`<img>`/download anchors point at for Synology-backed files.
- **`synology-storage-delete`** — removes the NAS file and the row (service role).
- **`synology-storage-migrate`** — batch worker: for each existing Cloud file (and rows without a pointer), create a signed Cloud URL, stream it to the NAS via SFTP, flip `backend` to 'synology', verify, then delete the Cloud copy. Idempotent, resumable, processes in bounded batches; on per-file failure marks `status='failed'` and continues.

### 4. Frontend integration (`src/modules/generator-ui`)
- New helper `resolveAssetUrl()` / `useAssetUrl()` (extends the existing `signedStorageUrl` pattern): if the file is Synology-backed, return the `synology-storage-stream` URL with the auth token; if Cloud, return the signed URL as today.
- Swap upload call-sites that produce large files (video outputs, merged videos, MP4 exports, uploaded source videos/images) to go through `synology-storage-upload`; keep small images/thumbnails on Cloud.
- `SignedImage` and video players resolve through `resolveAssetUrl()` so the source switch is transparent.
- Downloads: point the anchor at the stream URL with `?download=<filename>` so the proxy sets `Content-Disposition`.

### 5. Migration of existing files
Run `synology-storage-migrate` (manually triggered / batched) until all existing Cloud files are moved and their pointers flipped. Cloud copies are deleted only after a verified NAS write. The buckets stay private throughout.

## Reliability
- No silent fallback anywhere. NAS unreachable on upload/read/migrate → clear `STORAGE_UNAVAILABLE` error surfaced in the UI.
- Migration is non-destructive: Cloud delete happens only after the NAS copy is verified.

## Technical notes & risks (important)
- **Edge-function limits are the main constraint.** Edge functions have bounded memory/CPU and request duration. Proxying *very* large videos and serving seek/range requests through an SSH/SFTP stream works but adds latency and load versus direct Cloud signed URLs, and extremely large files or many concurrent streams may hit time/memory ceilings. The streaming proxy (range-aware, no full-file buffering) is designed to stay within limits, but this is the part most likely to need tuning.
- This routes all media bytes through the backend, so playback start time will be slightly slower than direct Cloud URLs.
- The NAS user must be in the `administrators` group with SFTP allowed and the media shared folder set Read/Write (per `skill/synology-nas-access`).
- Threshold is a single configurable constant (default ~20 MB) so "large" can be tuned without code changes elsewhere.

## Suggested order
1. `storage_objects` table + SFTP helpers.
2. `synology-storage-upload` + `synology-storage-stream` (+ frontend `resolveAssetUrl`), wire new uploads.
3. `synology-storage-delete`.
4. `synology-storage-migrate` + run migration of existing files.
