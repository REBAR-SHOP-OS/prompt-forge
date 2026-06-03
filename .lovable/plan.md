## Plan

Fix the **Pending / Working clips** restore bug so when the user has pressed **Start Over** and the workspace is blank, refreshing the page keeps it blank.

### What will change

1. **Stop broad restore into Pending**
   - Update the page refresh hydration logic in `DashboardPage.tsx` so it does **not** automatically reload every past server job/image into the active Pending column.
   - Only restore items that belong to the current active workspace/draft manifest.

2. **Respect Start Over as authoritative**
   - When **Start Over** clears the workspace and clears the active manifest, refresh should treat that as intentional and restore nothing.
   - Old videos remain available in storage/archive/library flows, but they should not reappear as active working clips.

3. **Keep current draft behavior safe**
   - If there is an active draft/workspace that has not been Start Over-cleared, refresh may restore only that draft’s clips/images.
   - Final Film project snapshots and Library behavior should stay unchanged.

### Technical details

- File to edit: `src/modules/generator-ui/pages/DashboardPage.tsx`
- Root cause: the hydration effect calls `listMyJobs()` and merges returned jobs into `generatedVideos` using only `workspaceHiddenJobIds` as a filter. If those hidden IDs are missing/stale or the active workspace was cleared, old server jobs are reintroduced to `displayedClips` after refresh.
- Fix approach:
  - Build restore allowlists from `activeJobIds`, `activeImageIds`, and/or the current `activeDraftId` snapshot.
  - During hydration, only hydrate jobs/images whose IDs are explicitly in those allowlists.
  - If the allowlists are empty, leave `generatedVideos` and `userImages` empty for Pending.

### Verification

- Press **Start Over** so Pending is empty.
- Refresh the page.
- Confirm Pending remains empty and the center preview remains in the empty “Start forging a prompt” state.
- Confirm existing Library/Archive videos are still accessible and not deleted.