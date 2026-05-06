# FINAL FILM button: preview-only

When the **FINAL FILM** button is clicked, build the merged film from the current cards (with their order, transitions, and soundtrack) and show it in the central preview area only. Do not auto-download the file. Always re-merge from scratch on every click (so it reflects the latest cards/transitions/music).

## What stays the same
- Re-merges from scratch on every click (already the case).
- Shows the merged result in the preview area (already calls `setPreviewVideoId(mergedId)`).
- Adds the merged film to the right-side history panel as a "Final merged video — N clips" card (already happens; lets the user re-select it later).
- Auto-saves to the left library panel (already happens).

## What changes — single small edit in `DashboardPage.tsx`
In `handleMergeAllVideos`, remove the block that triggers an automatic file download right after the upload finishes:

```ts
// Trigger download.
const blobUrl = URL.createObjectURL(mergeRes.blob)
const a = document.createElement('a')
a.href = blobUrl
a.download = filename
document.body.appendChild(a)
a.click()
a.remove()
setTimeout(() => URL.revokeObjectURL(blobUrl), 4_000)
```

That block is deleted. Nothing else is touched. The user can still download the merged film manually via the existing download control on the preview / library card if they want to keep a copy.

## Files touched
- `src/modules/generator-ui/pages/DashboardPage.tsx` — remove the auto-download block in `handleMergeAllVideos`.
