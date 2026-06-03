# Fix: uploaded video doesn't show as a card

## Problem
When a user uploads a video file, the backend saves it correctly (job + asset rows are created, `jobs-get` returns valid public URLs), but no card appears in the Working clips / Pending panel and the video can't be used.

## Root cause
In `src/modules/generator-ui/pages/DashboardPage.tsx`, `handleUploadVideoFile` finishes with:

```ts
setGeneratedVideos((current) => mergeJob(current, detail))
markActiveJob(detail.id)
```

`markActiveJob` only adds the id to `activeJobIds`; it does **not** assign the clip to the current working draft. Generated clips instead use `markNewClip`, which both stamps the clip into the active draft (`stampJobDraft(id, ensureActiveDraftId())`) and marks it active.

Without a draft stamp, the orphan-draft backfill effect puts the uploaded clip into its own separate draft (`draft-orphan-<jobId>`). The default workspace clip list (`displayedVideos` → `displayedClips`) filters out any clip that belongs to a draft other than `activeDraftId`, so the uploaded clip is hidden and Pending shows 0 / "No renders yet".

## Fix
In `handleUploadVideoFile`, replace `markActiveJob(detail.id)` with `markNewClip(detail.id)` so the uploaded clip joins the active working chain exactly like a generated clip. This makes the card render immediately, persist across refresh, and support trim/Apply, delete, drag, transitions, and Final Film — matching the existing generated-clip behavior.

## Files
- `src/modules/generator-ui/pages/DashboardPage.tsx` (one-line change in `handleUploadVideoFile`)

## Verification
- Upload a video → a card appears immediately in Pending and plays.
- Reload the page → the card is still present.
- Confirm it behaves like a generated clip (selectable, trimmable, included in Final Film).
