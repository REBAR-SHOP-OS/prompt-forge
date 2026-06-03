## Plan

I’ll fix this at the root by changing the restore/reset model from “hide whatever happens to be in memory” to “only restore what the active workspace manifest says belongs there.”

### Root cause to address

The previous fix only filtered restore by `workspaceHiddenJobIds` / `workspaceHiddenImageIds`.

But `handleStartOver()` hides only the videos/images currently loaded in React state. On refresh, `listMyJobs()` can return older server jobs that were not in memory when Start Over ran, so they are not in the hidden set and get rehydrated into Pending.

There is already an intended source of truth:

- `workspace-active-jobs:{userId}`
- `workspace-active-images:{userId}`

However the restore effect currently ignores those active manifests and restores every backend item that is not hidden.

## Implementation steps

1. **Add ready refs for active workspace manifests**
   - Mirror `activeJobIds` and `activeImageIds` into refs, similar to the hidden-set refs.
   - Add an `activeSetsReady` flag so hydration waits until both active sets are loaded from `localStorage`.

2. **Make hydration manifest-authoritative**
   - In the workspace restore effect, only hydrate:
     - jobs whose id exists in `activeJobIdsRef.current`
     - images whose id exists in `activeImageIdsRef.current`
   - Still also respect hidden sets as a defensive filter.
   - Result: after Start Over clears the active manifest, refresh restores zero loose Pending items.

3. **Prevent orphan backfill from rebuilding cleared workspaces**
   - Update the historical orphan-draft backfill so it does not stamp backend jobs/images into drafts unless they are still in the active manifest or already have an existing draft mapping.
   - This prevents old backend jobs from being converted into visible Draft/Pending cards after Start Over.

4. **Strengthen Start Over cleanup**
   - Keep clearing `activeJobIds`, `activeImageIds`, and `activeDraftId`.
   - Also persist these clears before any async delete work, which is already mostly done, and ensure refs are updated immediately so same-session effects cannot race with stale active ids.

5. **Keep Library intact**
   - Do not delete or mutate saved Final Film entries.
   - Keep existing `projectSourceJobs`, `projectSourceImages`, `draftSourceJobs`, and `draftSourceImages` snapshots so Library projects remain available.
   - Only the default loose Pending workspace becomes empty after Start Over and stays empty after refresh.

## Expected result

- Click Start Over → Pending becomes empty.
- Refresh page → Pending stays empty.
- Old backend videos/images no longer leak back into Pending.
- Saved Library projects/drafts remain visible and can still be opened intentionally.