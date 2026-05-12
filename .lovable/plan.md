# Fix: Final Film fails with "Need at least 1 finished item" after a previous finalize

## What you saw

You added music + voiceover, the **Final Film** button was clickable, but clicking it returned `Need at least 1 finished item (video or image) to finalize.` The History panel on the right was empty ("0").

## Root cause

In `DashboardPage.tsx`:

- The **button's enabled state** (line 2355) counts `completedSourceVideos.length + visibleUserImages.length`. `completedSourceVideos` is derived from the raw `generatedVideos` and **does NOT** filter out `workspaceHiddenJobIds`. So as long as any completed job exists in memory, the button is enabled.
- The **merge handler** (line 1922) builds `eligibleClips` from `displayedClips`. `displayedClips` is built on top of `displayedVideos`, which **does** filter out `workspaceHiddenJobIds` (line 932).

After every Final Film, all source jobs are added to `workspaceHiddenJobIds` (lines 2097–2100) so the History column looks fresh. From that moment:

- Button enabled (counts hidden jobs) ✅
- `displayedClips` empty (hides them) ❌
- → `eligibleClips.length < 1` → error

`resumeSelectedProject()` is called at the top of `handleMergeAllVideos`, but it only restores jobs when `selectedProjectId` is set. If the user is just continuing in the same workspace (no project re-opened from Library), the hidden source jobs are never restored and the merge silently has nothing to stitch.

## Fix

One small file: `src/modules/generator-ui/pages/DashboardPage.tsx`. Inside `handleMergeAllVideos`:

1. **Stop relying on `displayedClips`.** Build `eligibleClips` directly from the authoritative live data — the same data the button uses to decide whether to enable itself — so the two can never disagree:

   - all `completedSourceVideos` (videos with `status === completed` and a `video.storage_path`),
   - plus `visibleUserImages`,
   - plus, when `selectedProjectId` is set, any snapshot jobs not already present (already handled today).

2. Sort with the existing rule: `manualOrder` first, then chronological ASC. This matches `displayedClips`' own ordering, so the merged film still respects user drag-reorder.

3. As a side-effect of merging, **unhide** the source jobs that participated, so the History column reflects what was just stitched (mirrors what `resumeSelectedProject` already does for project-snapshot mode). This also fixes the visual confusion of "I just finalized N clips but History shows 0".

4. Keep the existing single-card guard (audio OR edit required) and the existing target-size / image-to-clip pipeline untouched.

The button-enable expression on line 2355 stays as-is — it's already permissive in the right direction; the bug was that the handler was *more* restrictive than the button.

## Out of scope

- No backend, RLS, storage, edge-function, or DB changes.
- `editedJobIds`, transitions, soundtrack range, image still-duration, project snapshots, drag-reorder: unchanged.
- The right-panel History UI logic is untouched. The only visible change is that after clicking Final Film, source cards become visible again (which is the correct behavior — they were just stitched).

## Verification

1. Generate 2 videos → Final Film with music → produces output, History now shows the 2 sources.
2. Without reloading, generate 1 more video → Final Film again → all 3 sources stitched, no error.
3. Upload 1 image, no videos, add music → Final Film → image still-clip + soundtrack, no error.
4. Re-open a previous project from Library (selectedProjectId set), add music, Final Film → snapshot clips re-stitched with new soundtrack (current path, still works).
5. Empty workspace (no completed clips, no images) → button disabled, no way to trigger the error.
