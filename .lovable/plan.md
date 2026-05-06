## Goal

Remove the small icon button at the top-right of the **HISTORY** panel header (circled in the screenshot). It's the "Merge all videos" button (a `Combine` icon, or a spinner with a percentage when merging is in progress).

## Fix

Edit only `src/modules/generator-ui/pages/DashboardPage.tsx`. Delete the entire `<button … aria-label="Merge all videos">…</button>` block (lines 1875–1895) inside the History panel header. The header layout already uses `justify-between`, so the left-side title group will naturally stay where it is.

The merge functionality itself (`handleMergeAllVideos`, the merge progress state) stays in place — we're only removing this UI entry point. If a different surface needs to trigger a merge in the future, it can be reintroduced there. No other files touched.

## Acceptance check

The HISTORY panel header now shows only `[icon] HISTORY [count]` — no icon button on the right. Layout, spacing, and the rest of the panel are unchanged.
