## Goal

Fix the `INVALID_FIRST_FRAME_URL` error that appears when generating a video after using an existing/uploaded image as the Start frame, without breaking any other flow.

## Root cause

The backend validator (`isAllowedFrameUrl` in `supabase/functions/_shared/modules/job-orchestrator/gateway.ts`) only accepts first/last frame URLs that point to `wan-frames/{userId}/...`. The frontend handler `handleUseImageAsStart(url)` in `src/modules/generator-ui/pages/DashboardPage.tsx` (line ~3930) sets the source image's public URL directly as the Start frame. That URL lives in the `user-images` bucket, so the backend correctly rejects it.

The AI-image flow already handles this (lines ~7117–7136) by re-uploading the image into the `wan-frames` bucket before staging it. The "Use as Start" handler does not.

## Fix (frontend only, minimal change)

Rewrite `handleUseImageAsStart` to **re-stage** the chosen image into the `wan-frames` bucket, mirroring the existing, proven AI-image staging pattern:

1. Switch to `image-to-video` mode.
2. Insert a Start-frame entry with `status: 'uploading'` (placeholder) so the UI shows progress and the Generate button stays disabled until the frame is ready.
3. `fetch()` the source image URL → `blob()`.
4. Upload to `FRAMES_BUCKET` at `${userId}/start-${Date.now()}-${crypto.randomUUID()}.png`.
5. Get its public URL via `getPublicUrl` and mark the entry `status: 'ready'` with that URL.
6. On any failure, mark the entry `status: 'failed'` with a clear message.
7. Keep the existing scroll-into-view of `#composer-start-frame`.
8. Guard for missing `userId` (signed-out) with a failed state, consistent with `uploadFrameFile`.

This reuses the existing `FRAMES_BUCKET` constant and the same upload/validation path the backend already trusts. No backend, schema, or business-logic changes are required.

## Why this is safe

- Single function changed in one file; no shared logic altered.
- No edits to the backend validator (security boundary stays intact — frames still must live under `wan-frames/{userId}/`).
- Other entry points that already stage into `wan-frames` (manual upload, AI image, reframe) are untouched.
- Failure is surfaced in-UI rather than failing silently at generate time.

## Technical details

- File: `src/modules/generator-ui/pages/DashboardPage.tsx`
- Function: `handleUseImageAsStart` (~line 3930), called from the archive image cards (~6319, ~6541) and the pending-clip image action (~7858) — all pass `img.storage_path` (a public URL), which the new async logic fetches and re-stages.
- Pattern to copy: AI-image staging block at lines ~7117–7136 (fetch → upload to `FRAMES_BUCKET` → `getPublicUrl` → mark ready/failed).

## Verification

- Click "Use as Start" on an archive image and on a pending-clip image → confirm the Start frame shows uploading then ready.
- Generate a video → confirm the `INVALID_FIRST_FRAME_URL` error no longer occurs.
- Confirm signed-out users get a clear failed state instead of a silent error.
