## Goal

Clicking a project (Final Film) in the Library panel should restore that project's source clip cards in the HISTORY panel, so the user can see/work with them again.

Currently, when a Final Film is created, the source jobs are deleted from the server. To make this possible, source clips must remain on the server and only be hidden from HISTORY.

## Approach

Two-part change, frontend only:

### 1. Stop server-side purge after Final Film
In `DashboardPage.tsx` `handleMerge` (around lines 2043–2074), remove the server purge step (`jobOrchestratorGateway.deleteJob` for source jobs and `generatorUiGateway.deleteUserImage` for images). Source jobs and uploaded images stay on the server.

Replace the purge with a hide-only behavior consistent with Start Over:
- Build a Set of source job IDs (`generatedVideos.filter(v => !v.id.startsWith('merged-')).map(v => v.id)`).
- Add them to `workspaceHiddenJobIds` and persist.
- Remove the `setGeneratedVideos(...)` filter that drops non-merged jobs — keep them in state so they can be unhidden later.
- Keep the local resets (`setUserImages([])` becomes only a UI clear, but since images are not deleted, just keep `userImages` as-is or clear locally — we'll keep the local clear so the composer feels reset; images remain on server and reload on refresh).
- Keep `setManualOrder(null)` and `setPendingEndAppends/Prepends` resets.

### 2. Track source clip IDs per Final Film
Extend the `mergedEntries` shape (stored in localStorage under `merged-videos:${userId}`) to record which source job IDs went into each Final Film:

- Add a non-breaking optional field on the local merged entry object: `sourceJobIds: string[]`.
- Populate it in `handleMerge` from `eligibleClips.map(c => c.id)` (excluding any `merged-` IDs).
- When loading from localStorage, default missing `sourceJobIds` to `[]` (older entries simply won't restore anything — acceptable).

### 3. Click handler on Library card → restore in HISTORY
In the Library aside (lines ~3220–3310), the existing `onClick` only sets `previewVideoId`. Extend it:

- Look up the merged entry: `const mergedEntry = mergedEntries.find(e => e.id === video.id)`.
- If it exists and has `sourceJobIds.length > 0`:
  - Compute `nextHidden = new Set(workspaceHiddenJobIds)` and remove every id in `sourceJobIds` from it.
  - `setWorkspaceHiddenJobIds(nextHidden)` + `persistWorkspaceHiddenJobIds(nextHidden)`.
  - Also clear `previewDismissed` so HISTORY is visible.
- Keep existing `setPreviewVideoId(video.id)` and `setIsApprovedPanelOpen(false)`.
- Library card for non-merged approved videos (not a Final Film) keeps current behavior unchanged.

### 4. Start Over and fresh-login flows
No change needed — they already hide all current jobs via `workspaceHiddenJobIds`. Because we no longer delete on merge, those existing hide flows now correctly cover the post-merge state too.

## What is intentionally NOT changed

- No backend / edge function / RLS / storage policy changes.
- No DB schema changes (`sourceJobIds` lives only in the localStorage merged entry blob — same place `mergedEntries` already lives).
- Uploaded images (`userImages`) are no longer purged from the server on merge; they remain available across sessions like before Final Film. Local UI state may still clear for a clean composer.
- Library card delete (`deleteCard`) behavior is unchanged.
- No change to how Final Film itself is rendered, stored, or downloaded.

## Trade-offs / notes

- Storage usage will grow: source clips that were previously deleted on merge now persist. This is an explicit choice the user made ("دیگر پاک نشوند، فقط مخفی").
- Final Film entries created before this change won't have `sourceJobIds` and clicking them will just preview (no restore). New ones will work.
- Source jobs remain visible in HISTORY only after the user clicks the Library card; otherwise they stay hidden via `workspaceHiddenJobIds`.
