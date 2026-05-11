## Problem

When the trash icon is clicked on a card in HISTORY while a project is selected (selected-project mode), the card sometimes does not disappear. Reason: `displayedVideos` in that mode is computed from the `projectSourceJobs` snapshot (localStorage), not from `generatedVideos`. `deleteCard` only removes the job from `generatedVideos` / `mergedEntries`, so the snapshot still resurfaces it.

Additionally, deleting a Final Film card (`merged-…`) leaves its snapshot orphaned in `projectSourceJobs`.

## Fix (frontend only, single file)

Edit `src/modules/generator-ui/pages/DashboardPage.tsx`, function `deleteCard` (≈ line 762):

1. After the existing optimistic state updates, also prune the deleted `jobId` from every entry of `projectSourceJobs`:
   - Build `nextMap` by mapping each `[mergedId, clips]` to `[mergedId, clips.filter(c => c.id !== jobId)]`.
   - Call `setProjectSourceJobs(nextMap)` and `persistProjectSourceJobs(nextMap)`.

2. If `isMerged` (deleting a Final Film card):
   - Remove `projectSourceJobs[jobId]` from the map before persisting.
   - If `selectedProjectId === jobId`, call `setSelectedProjectId(null)` so HISTORY exits selected-project mode.

3. Rollback path: on backend failure, restore the previous `projectSourceJobs` map (capture `prevProjectSourceJobs` alongside `prevGenerated` / `prevMerged` before mutation) and re-persist it.

No backend, gateway, RLS, or schema changes — server-side delete (`jobOrchestratorGateway.deleteJob` / storage `remove`) is already correct. This is purely closing the local-state gap so the trash icon truly removes the clip from view in every mode.

## Verification

- Click a Library project → HISTORY shows snapshot clips. Click trash on one → card disappears immediately and stays gone after refresh.
- Click trash on a Final Film card in Library → card disappears, snapshot for it is purged, and if it was the selected project, HISTORY returns to default mode.
- Simulate a backend failure (offline) → card reappears and snapshot is restored.