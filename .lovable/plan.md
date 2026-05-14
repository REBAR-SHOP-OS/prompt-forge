## Problem

After refresh or Start Over, the workspace HISTORY suddenly shows every video and image card from every project — even cards that were merged into Library projects, and even cards the user previously deleted. The user wants those cards permanently out of the default workspace and (for deleted ones) gone for good.

## Root cause

In `src/modules/generator-ui/pages/DashboardPage.tsx`, the `workspaceHiddenJobIds` hydration effect is broken:

```ts
// lines 604-609
const [workspaceHiddenJobIds, setWorkspaceHiddenJobIds] = useState<Set<string>>(new Set())
const workspaceHiddenJobIdsKey = userId ? `workspace-hidden-jobs:${userId}` : null

useEffect(() => {
  setWorkspaceHiddenJobIds(new Set())   // ← always resets to empty, never reads localStorage
}, [workspaceHiddenJobIdsKey])
```

So on every refresh the hidden-jobs set is cleared, and `displayedVideos` (line 1201) filters against an empty set → every job returned by `listMyJobs()` (including ones merged into Final Films and ones the user "deleted" via Start Over) reappears in the workspace.

The image equivalent (`workspaceHiddenImageIds`, line 664) does load correctly, so images only leak when the parallel job-side leak drags the project's clips back. The same effect also wipes the per-project film order on every render of the key.

A second issue: when the user "deletes" a card from the workspace via Start Over, the row is only hidden client-side. The user explicitly says these should never have been saved and should be permanently deleted. Today the row stays in `generator_generation_jobs` / `generator_user_images` forever, so any future client (or a wiped localStorage) shows them again.

## Fix — frontend only, `DashboardPage.tsx`

1. **Hydrate `workspaceHiddenJobIds` from localStorage** (mirror the image-side effect at line 664):
   ```ts
   useEffect(() => {
     if (!workspaceHiddenJobIdsKey) { setWorkspaceHiddenJobIds(new Set()); return }
     try {
       const raw = window.localStorage.getItem(workspaceHiddenJobIdsKey)
       const arr = raw ? (JSON.parse(raw) as string[]) : []
       setWorkspaceHiddenJobIds(new Set(Array.isArray(arr) ? arr : []))
     } catch { setWorkspaceHiddenJobIds(new Set()) }
   }, [workspaceHiddenJobIdsKey])
   ```

2. **Audit the parallel hydration blocks** for `projectSourceJobs`, `projectSourceImages`, `workspaceHiddenImageIds`, `selectedProjectId`, `previewState`, `manualOrder` — confirm each one reads localStorage on key change (not just resets). Fix any other reset-only effects found.

3. **Backstop the workspace filter so merged-project sources never leak**: in `displayedVideos` (line 1200) and `visibleUserImages` (line 1256), when `selectedProjectId` is null also exclude any id that appears in any value of `projectSourceJobs` / `projectSourceImages`. This guarantees that even if `workspaceHiddenJobIds` is somehow empty (first-time user on a new device, cleared storage, etc.), clips that already belong to a Library project never show up loose in the workspace.

4. **Permanent delete on Start Over**: change `resetWorkspace({ keepPreview: false })` (line 2566 / called at 2648) so that, in addition to adding ids to the hidden sets, it calls the existing delete pipeline for every workspace card that is *not* part of any project snapshot:
   - For each loose `JobDetail` → `jobOrchestratorGateway.deleteJob(id)` (same call used by the per-card trash button; backend RPC `generator_delete_job` already removes the row + storage).
   - For each loose `UserImageItem` → `generatorUiGateway.deleteUserImage(id)` (same call as the per-image trash button).
   - Run them with `Promise.allSettled` so one failure doesn't block the others; surface a single toast on partial failure.
   - After success, also drop the ids from local state (`setGeneratedVideos` / `setUserImages`) so the UI is clean immediately.
   - Project snapshots (`projectSourceJobs`/`Images` values) are preserved — those clips stay alive for their Library project.

5. **Confirmation prompt** before the destructive Start Over: a small confirm dialog ("Delete N clips and M images permanently? This cannot be undone.") so the user understands these are now real deletes, not just hides. Skip the prompt when there is nothing loose to delete.

## Verification

- Refresh the page with several merged projects in Library → workspace HISTORY is empty (no leaks). Open a project from Library → only that project's clips/images appear.
- Generate a fresh clip, click Start Over, confirm → clip is removed from the workspace AND from the database (verify via Library / network → `jobs-list` no longer returns it). Refresh → still gone.
- Existing Library projects are untouched after Start Over (their merged Final Film and snapshot clips remain).
- Per-card trash button still works exactly as before.

## Out of scope

- No backend, RPC, or schema changes — `generator_delete_job` and `generator_delete_user_image` already exist.
- No change to Library, merge, or per-card delete behavior beyond what is listed.
