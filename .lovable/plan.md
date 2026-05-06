## Problem

In the **Library** panel, every saved video card shows a blank black box where the video preview should be. The creation date underneath ("May 6, 12:08 PM") is already displayed correctly. The user wants the first frame of the video to always be visible as a thumbnail in the card, just like a normal video preview.

## Root cause

The `<video>` element in the library card uses `preload="metadata"`, which only downloads the file header (duration, dimensions) but **not the first frame**. There is also no `poster` attribute. Result: the player renders pure black until the user actually presses play. For merged Final Films there's no `thumbnail_url` either, so nothing fills the gap.

## Fix

Edit only `src/modules/generator-ui/pages/DashboardPage.tsx` in the Library card's `<video>` block (around line 2222–2229) and the matching block in the History panel (around line 2055–2065 for consistency). Apply the same first-frame-thumbnail pattern in both places:

1. **Add a `poster`** when the video has a `thumbnail_url` — so cards render instantly without downloading the video.
2. **Switch `preload` from `"metadata"` to `"auto"`** when there is no thumbnail — the browser will buffer enough data to paint the first frame on its own.
3. **Force a first-frame render** on `loadedmetadata`: in an `onLoadedMetadata` handler, set `video.currentTime = 0.05`. This is the standard trick to make HTML5 `<video>` paint frame 0 even before play is pressed (works in Chrome/Safari/Firefox). Also set `muted` and `playsInline` so the seek is allowed without user gesture.
4. Keep the existing `controls`, `playsInline`, the storage_path src, the date label, and all surrounding layout exactly as they are.

No other files touched. No layout, no copy, no behavior changes besides the thumbnail now being visible.

## Acceptance check

Open the Library panel: every saved card (including merged Final Films that have no stored thumbnail) shows the first frame of the video instead of a black box. The "Saved" label and the creation date stay visible at the bottom. Pressing play still works exactly as before.
