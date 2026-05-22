When the user creates a Final Film, automatically reset the workspace to a fresh "Start Over" state so it's ready for the next project.

### What will change
In `DashboardPage.tsx`, after the Final Film merge succeeds and the source clips are snapshotted / draft is closed, add an automatic workspace reset before the `finally` block.

### Exact steps
1. After line 3727 (end of draft cleanup inside the Final Film `try` block), insert:
   - `resetWorkspace({ keepPreview: false })` — clears composer, transitions, soundtrack, edited clips, merge progress, and hides all current workspace cards.
   - `setActiveJobIds(new Set()); persistActiveJobIds(new Set())` — clears the active job manifest.
   - `setActiveImageIds(new Set()); persistActiveImageIds(new Set())` — clears the active image manifest.

### Why this is safe
- The source clips are already claimed by `projectSourceJobs[mergedId]` and `projectSourceImages[mergedId]`, so they will NOT be deleted.
- `resetWorkspace` already hides all unclaimed workspace cards via `workspaceHiddenJobIds` / `workspaceHiddenImageIds`.
- The newly created Final Film remains in `mergedEntries` (Library) forever.
- No backend/schema changes needed.