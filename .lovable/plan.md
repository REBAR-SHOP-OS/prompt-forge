## Goal

Use the frame at **second 4** of each video as the thumbnail/poster shown inside the History and Library cards (instead of the current first-frame at 0.05s). For videos shorter than 4 seconds, fall back to the last available frame so the tile is never blank.

## Fix

Edit only `src/modules/generator-ui/pages/DashboardPage.tsx`. Update the two `onLoadedMetadata` handlers (lines 1975 and 2233 — History card and Library card) so the seek target is `min(4, duration - 0.05)` instead of `0.05`:

```ts
try {
  if (el.currentTime === 0) {
    const dur = Number.isFinite(el.duration) ? el.duration : 0
    el.currentTime = dur > 0 ? Math.min(4, Math.max(0, dur - 0.05)) : 0.05
  }
} catch { /* ignore */ }
```

The guard `el.currentTime === 0` keeps user playback intact (we only seek before they press play). The `Math.min(4, …)` clamps to the 4-second mark when the clip is long enough; `Math.max(0, dur - 0.05)` covers the short-clip case so we always have a real frame to paint. Nothing else changes — `preload="auto"`, `poster`, layout and styling all stay.

## Acceptance check

Open the History panel and the Library panel: each video card now displays the frame from second 4 of the video as its preview poster (e.g. for a 10-second clip, you see the 4s mark). Cards that wrap clips shorter than 4s show the final frame instead of black. Pressing play still works exactly as before.
