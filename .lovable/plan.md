## Problem

When the user clicks **START OVER**, the app should fully reset: the preview area must go blank, the **FINAL FILM** tab and the soundtrack chip in the top tab bar must disappear, and no leftover state should remain. Today, only the composer + history cards are cleared — the merged Final Film, the loaded soundtrack, transitions, manual order, and approved selections all stay in place, so the preview keeps showing the old video.

## Fix

Edit only `src/modules/generator-ui/pages/DashboardPage.tsx`, function `handleStartOver` (currently lines 1443–1466). Extend it to wipe every piece of session state that contributes to the preview / top tabs:

1. **Hide merged Final Films too**: add every `mergedEntries[i].id` to `deletedIds` (in addition to `generatedVideos`).
2. **Empty the merged list**: `setMergedEntries([])` and `persistMerged([])` so the FINAL FILM tab disappears and localStorage is cleared.
3. **Clear approved selections, transitions, and manual order**: `setApprovedIds(new Set())` (+ persist `[]`), `setTransitions({})`, `setManualOrder(null)`.
4. **Clear pending Start/End append maps** (state + their localStorage keys `pendingEndAppendsKey`, `pendingStartPrependsKey`).
5. **Tear down the soundtrack**: revoke `musicUrl` object URL, then `setMusicName(null)`, `setMusicUrl(null)`, `setMusicDuration(0)`, `setMusicRange([0, 0])`, `setIsMusicDialogOpen(false)` — this removes the audio chip from the top tab bar.
6. **Reset merge progress**: `setIsMerging(false)`, `setMergeProgress(0)`.
7. Keep all existing resets (composer text, uploads, mode, ratio lock, preview id, etc.).

No UI changes, no other files touched.

## Acceptance check

Click **START OVER** → confirm. Result: the preview area is empty (no video, no controls), the **FINAL FILM** tab and the audio chip beside it are gone, the History panel shows "No renders yet", and the composer is reset to its initial state. Refreshing the page keeps it empty (because the persisted localStorage entries were cleared too).
