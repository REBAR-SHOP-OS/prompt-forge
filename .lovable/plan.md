## Why this happens

Local models (Wan 2.1 / LTX) finish **synchronously** — the backend renders the clip, uploads it, and returns `status: "completed"` directly from the create call. The database is correct (I verified your last 5 local clips are completed with real video URLs in storage).

The bug is in the frontend:

1. When a clip is created, the UI seeds a card with `video: null` (the create response doesn't carry the video URL).
2. The status-polling loop **skips jobs that are already terminal** (`completed`), so it never fetches the job detail that contains the video URL.
3. Result: the card says "Ready" but the preview is stuck on "Waiting for render output" forever — until you reload the page, which re-hydrates everything.

Cloud models don't hit this because they return `processing`, so the polling loop runs and eventually delivers the video.

## Fix (frontend only — `src/modules/generator-ui/pages/DashboardPage.tsx`)

1. **Immediate hydration after create**: when `createJob` returns `status === "completed"`, immediately call `getJob(jobId)` and merge the full detail (including the video URL) into the card list. Apply at all three `createJob` call sites.
2. **Safety net in the polling loop**: treat jobs that are `completed` but missing `video.storage_path` as still "active" (with a short retry cap) so they get hydrated even if the immediate fetch fails transiently.

No backend changes needed — the data-URL → storage upload fix from earlier is already working.

## Result

Selecting a local model will show the rendered clip in the preview right away, with no page reload required.