# Fix: Pending repopulates after refresh following Start Over

## Problem
After clicking **Start Over** the workspace clears correctly, but on page refresh some clips/images reappear in the Pending column. Start Over is supposed to leave a clean workspace that survives refresh.

## Root cause
In `src/modules/generator-ui/pages/DashboardPage.tsx`:

1. The workspace-restore effect (~line 2755) hydrates jobs/images from the backend and filters them against `workspaceHiddenJobIds` / `workspaceHiddenImageIds`. But it depends only on `[userId]` and reads those sets from a **stale closure**. The hidden sets are loaded from `localStorage` in separate effects (lines 934 and 1173) that have not committed into the restore effect's closure when it runs. So the filter uses **empty** hidden sets and re-hydrates everything Start Over had hidden.
2. The orphan-draft backfill effect (~line 2228) never checks the hidden sets, so any resurfaced loose clip gets re-stamped into a new `draft-orphan-*` draft and shown again.

## Fix
1. Keep the current hidden sets in refs that always mirror the latest state (`workspaceHiddenJobIdsRef`, `workspaceHiddenImageIdsRef`), updated whenever the sets change.
2. Gate the restore effect so it only runs **after** the hidden sets have been loaded from `localStorage` for the current user (track a per-user "hidden sets ready" flag), and have it read the hidden sets from the refs rather than the closure. This guarantees hidden items are filtered out of hydration.
3. In the orphan-draft backfill effect, skip any job whose id is in `workspaceHiddenJobIds` (and any image in `workspaceHiddenImageIds`) so a hidden item can never be re-stamped into a new orphan draft.

This keeps drafts in Library intact (Start Over still preserves them there) while ensuring the working Pending column stays empty across refresh.

## Files
- `src/modules/generator-ui/pages/DashboardPage.tsx`

## Verification
- Create clips, click Start Over → Pending empties.
- Refresh → Pending stays empty; no clips/images reappear.
- Confirm previously saved Library drafts/projects are still present and openable.
- Generate a new clip after Start Over → it appears normally in Pending.
