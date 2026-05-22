## Problem

When opening a Final Film from the Library, the right "Working clips" panel sometimes shows a single empty `0:00` card (the final film itself) instead of the source clips that produced it — and sometimes shows nothing. This happens for Final Films that were merged before the `projectSourceJobs` snapshot system existed (or where the snapshot upload failed silently), because:

1. `projectSourceJobs[selectedProjectId]` is empty for those old projects.
2. The legacy fallback in `displayedVideos` (DashboardPage.tsx ~1747-1765) does not exclude the merged entry itself, so the Final Film's own merged file ends up rendered as a "source clip" card with no playable thumbnail → blank `0:00` card.
3. Once the merged entry sneaks into the list, the real source clips (which exist in `generatedVideos` but were created before the merged entry) are still considered, but if their `claimed` set is wrong or their `created_at` is after the merge, they get filtered out.

## Fix (DashboardPage.tsx only)

### 1. Harden the selected-project source list (`displayedVideos`, lines 1727-1793)

- In **all branches** (snapshot, single-clip, legacy fallback), filter out any clip whose id equals `selectedProjectId` and any id starting with `merged-`. The merged film itself must never appear in its own Working-clips list.
- In the single-clip Library branch, only return the clip when `live?.video?.storage_path || savedJob?.video?.storage_path` is truthy — never a blank card.
- In the legacy fallback, also drop any clip that has no `video.storage_path` (prevents the 0:00 placeholder).

### 2. Backfill `projectSourceJobs` for legacy Final Films

Add a one-shot effect (next to the existing draft backfill at ~1667) that runs once `mergedEntries`, `librarySavedJobs`, `generatedVideos`, `userImages`, and `projectSourceJobs` have hydrated:

- For every Library project id (`mergedEntries[*].id` and `Object.keys(librarySavedJobs)`) that has **no** entry (or an empty array) in `projectSourceJobs`:
  - Resolve the merged entry's `created_at`.
  - Pick non-merged completed `generatedVideos` with `video.storage_path`, `created_at <= mergedAt`, not already claimed by any other project's snapshot, ordered ASC.
  - Same for `userImages` → `projectSourceImages`.
  - If at least one source is found, persist it via `setProjectSourceJobs` / `persistProjectSourceJobs` (and the images equivalent). If zero are found, write `[]` so we don't re-run the heuristic every render and don't end up showing the merged film as its own source.
- Guard: skip ids whose snapshot key is already present (even if empty) to keep the backfill idempotent.

### 3. Empty-state UX (no new component)

When `displayedClips.length === 0` while a Final project is selected, the existing empty state already renders. Update its copy (the existing string in the empty branch around line 4694) for the selected-project case to: "Source clips for this project are no longer available."

## Files touched

- `src/modules/generator-ui/pages/DashboardPage.tsx` only. No backend or schema changes.

## Verification

- Open the highlighted "Final clip — soundtrack applied" project → Working clips now shows the real source clip(s) with proper thumbnails, never the 0:00 placeholder of the merged film itself.
- Open a freshly-merged Final Film → unchanged behavior (snapshot path still wins).
- Open a legacy Final Film with truly no traceable sources → panel shows the new empty-state copy instead of a blank `0:00` card.
- Refresh the page → backfilled snapshots persist, no re-computation needed.
