## Root cause

`DashboardPage.tsx` has **two independent effects** that both create Draft cards from the same source clips/images, and they race on first paint:

1. **Active-workspace auto-snapshot** (lines 1473-1561) — creates one `draft-<uuid>` per session that wraps every live clip/image in the current workspace.
2. **Historical-orphan backfill** (lines 1564-1670) — walks `generatedVideos` / `userImages` and creates a separate `draft-orphan-<jobId>` card for every clip/image not yet "claimed" by a Final Film, an existing Library project, **or** an existing draft snapshot.

The orphan backfill is supposed to skip anything already in `draftSourceJobs`, but on the same render where a new clip first arrives, effect (2) often runs against state where `draftSourceJobs` has not yet been updated by effect (1). Result: the same clip ends up in both:
- `draft-<uuid>` (active workspace draft)
- `draft-orphan-<jobId>` (orphan backfill)

→ Two identical "58777.mp4 — DRAFT • 1 CLIP" cards in the Library, as shown in the screenshot.

## Fix

Make the orphan backfill the **fallback path only**. It must never claim a clip/image that is currently visible in the live workspace, because the active-workspace effect already owns those.

In the backfill effect (around line 1598-1646):

- Skip any `job` where `!workspaceHiddenJobIds.has(job.id)` — i.e. the clip is still part of the active workspace; the auto-snapshot will (or already did) wrap it in the single active draft.
- Skip any `img` where `!workspaceHiddenImageIds.has(img.id)` — same reasoning for uploaded images.
- Add `workspaceHiddenJobIds` and `workspaceHiddenImageIds` to the dep array so the backfill re-runs when Start Over hides items and they truly become orphans.

This guarantees: live workspace → exactly one `draft-<uuid>`; items removed from the workspace via Start Over (and not part of any Final Film) → exactly one `draft-orphan-…` card each. No more duplicates.

## One-time cleanup of existing duplicates

For users who already have duplicated drafts persisted in `localStorage`, add a small idempotent dedupe pass that runs once on mount:

- Build a map `jobId → draftId` from `draftSourceJobs` and `draftSourceImages`.
- If the same underlying source id appears in both a `draft-<uuid>` and a `draft-orphan-…` entry, drop the `draft-orphan-…` one from `draftEntries`, `draftSourceJobs`, `draftSourceImages` and add its id to `deletedDraftIds` so the backfill never resurrects it.
- Persist the cleaned maps with the existing `persistDraft*` helpers.

This keeps the UI honest for current sessions without requiring users to clear storage.

## Files to change

- `src/modules/generator-ui/pages/DashboardPage.tsx` — guard the backfill effect, add dep entries, add the one-time dedupe pass near the existing draft effects.

## Safety

- No DB, RLS, auth, or migration changes.
- No edits to Final Film / merge / transcode pipelines.
- Pure client-side change to draft bookkeeping; existing Library, Final Films, and project snapshots are untouched.
- Backwards compatible with previously saved `draft-*` and `draft-orphan-*` entries — the cleanup pass only removes the duplicate orphan twin, never the active draft.

## Validation

- New clip in empty workspace → exactly one Draft card appears in Library.
- Refresh page → still one Draft card (no orphan twin spawned).
- Start Over → that draft becomes an orphan-style card (still one), and a new clip after Start Over creates its own single draft.
- Existing accounts with two duplicate cards: after first load, one of the two disappears and does not return on refresh.
