## Auto-remove draft after Final Film succeeds

Currently in `src/modules/generator-ui/pages/DashboardPage.tsx` lines ~3795-3809, after a successful Final Film the code intentionally keeps the draft entry in Library (only clearing `activeDraftId`). The comment says: "Drafts are never auto-removed by Final Film."

Change this behavior so a finalized draft is removed from the Drafts section.

### What to do

In that block, after `setMergedEntries` succeeds, compute the set of draft ids to retire:
- `activeDraftId` (the implicit in-progress draft)
- `selectedProjectId` if it starts with `draft-` (user explicitly opened a draft and finalized it)

For each such draft id:
1. Remove from `draftEntries` and persist via `persistDraftEntries`.
2. Remove its entry from `draftSourceJobs` and persist.
3. Remove its entry from `draftSourceImages` and persist.
4. Add to `deletedDraftIds` and persist (so the draft auto-snapshot effect doesn't recreate it from the same source clips, since those clips are now claimed under `projectSourceJobs[mergedId]`).

Then clear `activeDraftId` (already done) and switch `selectedProjectId` to `mergedId` if it pointed at a removed draft (already done).

Update the comment to reflect the new behavior.

### Files
- `src/modules/generator-ui/pages/DashboardPage.tsx` only.

### Risk
- The source clips for the draft are already claimed under `projectSourceJobs[mergedId]` earlier in the same block, so they remain visible inside the new Library card's HISTORY view. No data loss.