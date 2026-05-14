# Auto Start-Over after Final Film

## Goal
When the user clicks **Final Film** and the merge completes successfully, the workspace should automatically reset (same effect as pressing **Start Over**) so the user can immediately begin the next project. The Library/HISTORY panel and the just-finished Final Film preview must remain intact.

## Where
`src/modules/generator-ui/pages/DashboardPage.tsx`

- `handleMergeAllVideos` (around lines 2156–2418) — runs the Final Film merge.
- `handleStartOver` (around lines 2420–2490) — already implements the workspace reset and explicitly preserves Library/Final Film entries (`mergedEntries` + `approvedIds`).

## Change

After the merge succeeds (right after the source-clips snapshot block, around line 2401, before the `catch`), call a reset that performs everything `handleStartOver` does **except**:

- Do NOT clear `previewVideoId` — keep the freshly merged Final Film visible in the preview dialog so the user still sees the result.
- Do NOT set `previewDismissed = true` for the same reason.

Implementation approach: extract the body of `handleStartOver` into a small helper `resetWorkspace({ keepPreview }: { keepPreview: boolean })`, then:
- `handleStartOver()` calls `resetWorkspace({ keepPreview: false })` (current behavior, no UX change for the existing button).
- The success path of `handleMergeAllVideos` calls `resetWorkspace({ keepPreview: true })` after `setPreviewVideoId(mergedId)` and the source-jobs snapshot.

When `keepPreview` is true, skip:
- `setPreviewVideoId(null)`
- `setPreviewDismissed(true)`

Everything else (transitions, manualOrder, edited clips, music/voiceover teardown, composer reset, hiding generated jobs from HISTORY, releasing `selectedProjectId` and `lockedProjectRatio`) runs as today.

## Why this is safe
- `handleStartOver` is already designed to preserve Library outputs (`mergedEntries`, `approvedIds`) and storage files — no destructive side-effects.
- The merge-success path already hides source jobs from HISTORY (lines 2396–2401) and resets `manualOrder` / pending appends (lines 2403–2408) — the new helper will be a superset of that, so we can also remove those now-duplicated lines to keep behavior single-sourced.
- Failure path is untouched: if the merge throws, no auto-reset happens and the user keeps their workspace to retry.
- The Final Film preview stays open, the soundtrack chip in the top tabs disappears, and the composer is empty — exactly the "ready for next project" state the user asked for.

## Out of scope
- No backend / edge-function changes.
- No changes to `handleStartOver`'s confirmation dialog (that still guards manual Start-Over clicks).
