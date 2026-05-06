## Goal

When the user picks an aspect ratio (9:16 Reels, 1:1 Post, 16:9 YouTube) and submits a prompt, the generated clip, every preview surface, and the merged final film must all use exactly that ratio — never a forced 16:9 letterbox.

## Root causes found

1. **Backend i2v call drops the ratio.** In `supabase/functions/_shared/modules/external-api-adapter/service.ts`, `startWanI2V` (image-to-video) sends `resolution: "720P"` but no `ratio` parameter, so DashScope falls back to its default (16:9). Only `startWanT2V` currently passes `ratio: input.aspectRatio`.
2. **All preview containers are hard-locked to `aspect-video` (16:9).** In `src/modules/generator-ui/pages/DashboardPage.tsx`:
   - main preview stage (line ~1558),
   - history thumbnails (line ~1736),
   - approved-panel previews (line ~1993).
   This pillar/letterboxes 9:16 and 1:1 clips inside a 16:9 frame.
3. **Per-job aspect ratio isn't tracked locally.** The frontend already sends `aspectRatio` to `createJob`, but the returned `JobDetail` shown in the UI has no client-known ratio to drive the preview container, so the UI can't size itself correctly even if we fix the CSS.
4. **Merged-final entry stores `aspect_ratio: null`.** The merged record (line ~1261) doesn't carry the ratio either, so the same 16:9 container distorts the final film preview.

The merge canvas itself (`mergeVideos.ts`) already adopts the first clip's intrinsic `videoWidth`/`videoHeight`, so once clips are produced in the right ratio, the merged video file will already be correct — only the preview chrome needs to follow.

## Plan

### 1. Backend — pass aspect ratio to Wan i2v

File: `supabase/functions/_shared/modules/external-api-adapter/service.ts`

In `startWanI2V`, add `ratio: input.aspectRatio ?? "16:9"` to the `parameters` object, mirroring `startWanT2V`. No contract changes needed — `GenerationStartInput.aspectRatio` is already plumbed through `jobOrchestratorGateway.createJob` → `aiGateway.startGeneration`.

### 2. Frontend — remember the chosen ratio per job

File: `src/modules/generator-ui/pages/DashboardPage.tsx`

- Maintain a local `Record<jobId, '9:16' | '1:1' | '16:9'>` (e.g. `clipAspectRatios`) persisted in `localStorage`, mirroring how `mergedEntries` / `approvedIds` are stored.
- When `createJob` returns, store `{ [jobId]: aspectRatio }` for the just-submitted job.
- For merged entries, store the ratio used for that final film as well (read from the first source clip's ratio, defaulting to current `aspectRatio` state).
- Helper: `getRatioFor(video) → '9:16' | '1:1' | '16:9'` that prefers the local map, then falls back to the video record's `aspect_ratio`, then to `'16:9'`.

### 3. Frontend — make every preview container follow the clip's ratio

Same file. Replace the hard-coded `aspect-video` classes with a dynamic `style={{ aspectRatio: ratioToCss(ratio) }}` (and drop `aspect-video`):

- Main preview stage (~line 1558): use `getRatioFor(previewVideo)`. Keep `max-h-[82vh]`, `w-full`, `object-contain`, and let width be capped so 9:16 doesn't exceed viewport height.
- History thumbnail (~line 1736): use the per-card ratio.
- Approved-panel preview (~line 1993): same.
- Empty/placeholder states (`grid aspect-video place-items-center`) at ~1744 and ~2000: same dynamic ratio so the skeleton matches the clip that will land.

`ratioToCss('9:16') = '9 / 16'`, etc.

### 4. Merged final film — record + preview correct ratio

Same file, around line 1248–1264:
- Set `aspect_ratio` on the merged `JobDetail` to the source-clip ratio (so reload still works).
- Also store it in the `clipAspectRatios` map under the merged id.
- Main preview will then automatically pick it up via `getRatioFor`.

(`mergeVideos.ts` is already correct — it inherits canvas dimensions from the first clip, so a 9:16 source produces a 9:16 mp4.)

### 5. Hint to user (small, optional polish)

Show the active ratio chip subtly above the player (e.g. `9:16 · Reels`) so it's clear which ratio the current preview is locked to. Not required for correctness.

## Files touched

- `supabase/functions/_shared/modules/external-api-adapter/service.ts` — add `ratio` to i2v body.
- `src/modules/generator-ui/pages/DashboardPage.tsx` — per-job ratio map, dynamic preview containers, merged-entry ratio.

## Out of scope

- No DB migration: the existing `aspect_ratio` column on the video asset is already populated by `completeJob` when the provider returns it; the local map is a frontend-only enhancement so the UI can render correctly even before the asset row exists (during processing).
- No changes to `mergeVideos.ts` or `imageToClip.ts` — they already respect intrinsic clip dimensions.
