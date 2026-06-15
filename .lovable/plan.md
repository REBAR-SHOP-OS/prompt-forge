## Goal

When a card is regenerated, the **previous (source) card must be permanently deleted** from the project — from the database, from Storage, and from every in-app view — instead of being merely hidden from the workspace.

## Current behavior (the problem)

In `regenerateCard` (`src/modules/generator-ui/pages/DashboardPage.tsx`, ~lines 5074–5081), after the new job is created the old card is only **hidden**:

```ts
// Keep the old version on the server (Storage is the permanent archive)
// and only hide it from the workspace so the regenerated card replaces it.
setWorkspaceHiddenJobIds((curr) => {
  const next = new Set(curr)
  next.add(job.id)
  persistWorkspaceHiddenJobIds(next)
  return next
})
```

So the old DB row, the old video file in Storage, and the old entry in archive/library views all survive. The user wants it gone everywhere.

## Fix

Replace the "hide" block in `regenerateCard` with a **permanent purge of the old job**, reusing the exact cleanup the manual delete already does (`deleteCardConfirmed`). Concretely:

1. After the new card is placed in the slot and `markDerivedClip(job.id, seededJob.id)` runs, call the existing non-draft deletion path for `job.id`. This will:
   - remove the DB row and the Storage video file via `jobOrchestratorGateway.deleteJob(job.id)` (server-side, which is what already powers manual delete);
   - strip the old id from every local collection: `generatedVideos`, `mergedEntries`, `approvedIds`, `editedJobIds`, `editedClips`, `librarySavedJobs`, `jobDraftMap`, `draftSourceJobs`, `projectSourceJobs`, and empty-draft pruning;
   - clear `previewVideoId` if it pointed at the old id.

2. Because the new (regenerated) card uses a **different id** (`seededJob.id`), deleting `job.id` removes only the old card and leaves the new one intact.

3. Remove the now-obsolete `setWorkspaceHiddenJobIds(... add job.id ...)` block so we no longer leave a hidden archive copy.

### Ordering / safety details

- Perform the purge **only after** `createJob` succeeds and the new seeded card is in place — on the error branch nothing is deleted (old card stays, exactly as today).
- The old code moved the regenerating spinner from `job.id` to `seededJob.id`; keep that. Deleting `job.id` afterward is independent of the spinner state keyed on `seededJob.id`.
- `markDerivedClip(job.id, seededJob.id)` is still called before the delete so any derived-clip bookkeeping is recorded; if that mapping keys off the old id and is no longer needed once the source is destroyed, it is harmless (the old id simply never appears again).
- Wrap the purge so a Storage/DB delete failure does not roll back or hide the freshly created new card — the regeneration itself already succeeded. A failed cleanup should surface a non-blocking message (reuse `setVideoColumnMessage`) rather than throw.

### Implementation note

To avoid duplicating the ~200 lines of local-state cleanup, factor the body of `deleteCardConfirmed` (the non-draft branch) so `regenerateCard` can invoke the same purge for `job.id`. Simplest safe approach: call `deleteCardConfirmed(job.id)` directly from `regenerateCard` after the new card is staged (it already performs both the server delete and full local cleanup, and contains no `window.confirm` — confirmation lives in the separate `deleteCard` wrapper). This keeps a single code path for permanent deletion.

## Scope

- Single file: `src/modules/generator-ui/pages/DashboardPage.tsx` (the `regenerateCard` function only).
- No backend, contract, or schema changes — `jobs-delete` / `deleteJob` already permanently remove the DB row and Storage file.
- No change to manual delete, draft delete, or any other flow.

## Validation

- Regenerate a card → confirm the new card appears in the same slot, and the old card no longer appears in the workspace, the project/archive list, the library, or preview.
- Reload the app → the old card does not reappear (DB row gone, not just hidden).
- Confirm the old video file is removed from Storage (server delete path already covers this).
- Regenerate when `createJob` fails → old card remains untouched.
