# Library → HISTORY: Always Show Source Clips in Final-Film Order

## Two problems in the screenshot

1. **HISTORY shows "0" / "No renders yet"** when an old Library project is selected (the bottom one — created May 12). New projects do show their clips; old ones don't.
2. **Order is wrong**: when the snapshot does exist, HISTORY re-sorts the source clips by `created_at`, not by the order they appear in the merged Final Film.

## Root cause

In `src/modules/generator-ui/pages/DashboardPage.tsx`:

- `displayedVideos` (selected-project branch, line ~1082) reads `projectSourceJobs[selectedProjectId] ?? []` and then **re-sorts by `created_at` ASC** (line 1089-1091). That destroys the merge order.
- `projectSourceJobs[mergedId]` is built from a `Map` whose insertion order is "snapshot first, then live" (lines 2359-2362), not the actual `eligibleClips` order used to build the film.
- For projects created before the snapshot feature shipped, `projectSourceJobs[mergedId]` is `undefined` / `[]`, so HISTORY is empty with no fallback.

## Fix

In `DashboardPage.tsx` only (no backend changes):

1. **Store source clips in film order at merge time** (~line 2349-2367): build `sourceJobs` by iterating `eligibleClips` (the exact ordered list passed to the merger), keeping only `kind === 'video'` entries. This preserves the Final Film sequence in the snapshot.

2. **Preserve snapshot order in HISTORY** (`displayedVideos`, ~line 1079-1092): in selected-project mode, return `snapshot.map((s) => liveById.get(s.id) ?? s)` **without** the `.sort(...)` step. The snapshot itself is already in the correct order.

3. **Fallback for legacy projects with no snapshot**: when `selectedProjectId` is set and `projectSourceJobs[selectedProjectId]` is empty/missing, derive the source list from `generatedVideos` by filtering completed non-merged clips whose `created_at` is `<=` the merged entry's `created_at` and that aren't part of any *other* project snapshot. Order them by `created_at` ASC. This gives users at least a best-effort History view for old Library items, instead of "No renders yet". If even that yields nothing, surface a one-line note in the History area: *"Source clips for this project aren't tracked. Newer projects keep them automatically."*

4. **Keep the `displayedClips` merge step intact** (it appends images after videos and applies `manualOrder`), so dragging a card in HISTORY of a selected project still works.

## Out of scope

- No DB migration. The fallback in step 3 is heuristic-only because old merges never recorded their source IDs.
- No change to merge/composer/preview code paths beyond the snapshot ordering line.
- No change to the Library list itself.

## Verification

- Click a Library project created **after** this change → HISTORY shows exactly the clips in the film, in film order.
- Click an older Library project → HISTORY shows a best-effort list (or the explanatory note if none can be inferred), never silently empty.
- Drag-reorder a card inside a selected project → still works.
- Final Film a fresh project → reopening it later shows clips in the same order they were merged.
