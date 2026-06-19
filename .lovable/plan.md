# Route everything to Synology + migrate existing files

## Verified current state (your two questions, answered)

1. **Files routed to Synology? ❌ Not yet.** The `storage_objects` tracking table is **empty**. All existing media is still in Lovable Cloud: **26 videos + 37 images (63 files)**. The migration worker exists but has never been run.
2. **Download buttons "not active"? ❌ They are fully active.** The library `Download original (WEBM)` / `Download as MP4 (converted)` menu is wired end-to-end (`mp4-export-create` → `mp4-export-status` → NAS-aware signed/stream download). You asked to keep these as-is — no change.

The current NAS routing rule is **≥ 20 MB only** (`uploadAsset.ts` and the migrate worker both default to a 20 MB floor). You want **all files** on Synology, so the floor must drop to 0.

## What I'll change

### 1. Lower the routing threshold to "all files"
- `src/modules/generator-ui/lib/uploadAsset.ts`: set `NAS_THRESHOLD_BYTES = 0` so every new upload (videos, images, audio, frames) routes through `synology-storage-upload` instead of Cloud.
- `supabase/functions/synology-storage-migrate/index.ts`: change `minBytes()` default from `20*1024*1024` to `0` so the migrator picks up every file, not just large ones.
- Confirm `synology-storage-upload` doesn't impose its own size floor (it doesn't gate on size today — just stores what it's given).

### 2. Migrate the 63 existing Cloud files to the NAS now
Run `synology-storage-migrate` (service-role, internal token) **repeatedly in batches** until drained. For each file the worker already:
- marks `storage_objects` row `migrating`
- streams the file from a Cloud signed URL → SFTP write to `/volume1/ERP/media/<bucket>/<path>`
- verifies the NAS file (`sftpStat`, size > 0)
- flips the row to `backend=synology, status=active`
- **deletes the Cloud copy only after the verified write** (non-destructive / safe-mode behavior you require)

I'll loop calls (`limit` up to 25/batch) across all 6 buckets until `migrated + failed` stops advancing, then report a final tally and re-query `storage_objects` to confirm `backend=synology` for all rows.

### 3. Verify, don't assume
- Re-run the live NAS connection check first (host/port/auth/disk) before moving bytes.
- After migration: query `storage_objects` grouped by backend/status to confirm 0 remaining on Cloud and 0 `failed`.
- Spot-check that a migrated image and a migrated video still resolve/play in the library via the NAS stream proxy (the resolver already handles `<bucket>/<path>` → NAS URL).

## Safety notes
- Migration is **non-destructive**: Cloud delete happens only after a verified NAS write. Any file that fails verification stays in Cloud and is marked `failed` for retry.
- Download buttons remain untouched and functional.
- Routing all small files (thumbnails/frames) to the NAS means every media read goes through the NAS stream proxy; this is the behavior you requested ("all files to Synology").

## Out of scope
- No changes to the WEBM/MP4 download UI.
- No schema changes (the `storage_objects` table and all functions already exist).
