# Purge old video from storage on Trim clip "Apply changes"

## Goal
When the user clicks **Apply changes** in the Trim clip dialog, the previous video file must be **permanently deleted from storage**, while the new (trimmed) file stays.

## Current behavior (root cause)
The trim flow uploads the new trimmed file to the `merged-videos` bucket, then calls the `jobs-update-edited-video` edge function. That function:
1. Soft-deletes the previous `generator_video_assets` row(s) (`deleted_at` set), and
2. Inserts a new asset row pointing at the new file.

It **never removes the old physical file from storage** — only the DB row is hidden. So orphaned video files accumulate in the bucket forever. (The `deleteJob` flow already does a proper storage purge; this flow does not.)

## Fix
Edit `supabase/functions/jobs-update-edited-video/index.ts` to purge the old file(s) from storage, reusing the same purge logic already proven in the delete-job path.

Sequence inside the handler:
1. **Before** soft-deleting, fetch the storage paths of the current live asset(s):
   `select id, storage_path from generator_video_assets where job_id = jobId and user_id = auth.userId and deleted_at is null`.
2. Soft-delete the old asset row(s) (unchanged).
3. Insert the new asset row (unchanged).
4. **After** the new asset is successfully inserted**, best-effort delete the old physical files from storage:
   - Skip any path equal to the new `storagePath` (safety: never delete the file we just saved).
   - Resolve each old path to `bucket` + `objectPath` using the same rules as `deleteJob` (handle both full Supabase storage URLs and `"<bucket>/<path>"` strings), limited to known buckets `merged-videos`, `wan-frames`, `user-videos`.
   - Group by bucket and call `svc.storage.from(bucket).remove(paths)`.
   - Wrap in try/catch and log failures — a storage-remove failure must NOT fail the apply (the DB swap already succeeded).

## Order matters
The old file is removed only **after** the new asset row is inserted, so a failed upload/insert never destroys the existing video.

## Files
- `supabase/functions/jobs-update-edited-video/index.ts` — add pre-fetch of old paths + post-insert storage purge.

No frontend changes, no DB migration, no new RPC needed. Edge function deploys automatically.

## Test checklist
1. Open a generated clip → Trim clip → mark a cut / mute → Apply changes.
2. Confirm the card shows the new trimmed video.
3. Verify the old file is gone from the `merged-videos` bucket and the new file remains.
4. Confirm an apply still succeeds (and shows the new clip) even if storage purge logs a non-fatal error.
