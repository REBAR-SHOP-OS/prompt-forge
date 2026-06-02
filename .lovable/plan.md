## Goal

When the user clicks the delete (trash) icon on a Library card — whether it's a **Final Film** project or a **Draft** — the underlying video/image must be permanently removed from cloud Storage, not just hidden from the workspace.

## Current behavior (the problem)

In `src/modules/generator-ui/pages/DashboardPage.tsx`, the `deleteCard(jobId)` function currently treats Storage as a permanent archive and only *hides* items:

- **Draft cards** (`jobId` starts with `draft-`): the clips are added to `workspaceHiddenJobIds` and the server jobs are kept. Files stay in Storage. (lines ~1719–1729)
- **Real Final Film jobs**: the job is added to `workspaceHiddenJobIds` and kept on the server. Files stay in Storage. (lines ~1870–1880)
- **Merged-only entries** already purge their file from the `merged-videos` bucket.

The backend already supports permanent deletion:
- `jobOrchestratorGateway.deleteJob(jobId)` → the `deleteJob` edge gateway deletes the DB job AND removes the video file(s) from Storage.
- `generatorUiGateway.deleteUserImage(imageId)` → permanently deletes the image row + Storage file (already used by `handleDeleteUserImage`).

## Changes

All edits are in `src/modules/generator-ui/pages/DashboardPage.tsx`, inside `deleteCard`.

### 1. Draft delete → permanently purge underlying clips and images
Replace the "hide only" block (lines ~1719–1729) so that instead of adding clip ids to `workspaceHiddenJobIds`, it:
- Calls `jobOrchestratorGateway.deleteJob(clipId)` for every real clip id in `draftSourceJobs[jobId]` (this purges Storage server-side).
- Calls `generatorUiGateway.deleteUserImage(imageId)` for every image id in `draftSourceImages[jobId]`.
- Runs these concurrently with `Promise.allSettled` so one failure doesn't block the rest, and surfaces any error via `window.alert` (consistent with existing error handling).
- Keeps all the existing local state cleanup (tombstones, snapshot removal, draft-map pruning) so the UI stays consistent.

### 2. Final Film / real job delete → permanently purge from Storage
Replace the `else` branch (lines ~1870–1880) that adds the job to `workspaceHiddenJobIds`:
- Call `await jobOrchestratorGateway.deleteJob(jobId)` instead, which deletes the job row and removes the video file from Storage.
- Keep the existing optimistic removal and the rollback-on-failure logic already present in the surrounding `try/catch`.

### 3. Update the confirmation copy (optional clarity)
The confirm dialog already says "permanently"; no change needed, but the merged-entry path stays as-is (it already purges its file).

## Technical notes

- Draft clip ids stored in `draftSourceJobs` are real server job ids, so `deleteJob` works directly on them.
- `deleteJob` is idempotent enough for the UI: if a job is already gone the call may 404; we'll swallow per-item failures in the draft loop via `allSettled` and only alert on real errors.
- No backend/migration changes required — the edge functions and RPC (`generator_delete_job`) already cascade to Storage.
- The `workspaceHiddenJobIds` mechanism remains in the codebase for any other callers, but the delete button will no longer use it.

## Files touched
- `src/modules/generator-ui/pages/DashboardPage.tsx`
