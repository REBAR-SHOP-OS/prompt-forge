## Goal
A film cover must appear **only inside its own project** — never in the active workspace pending, never inside another project, and never as its own standalone "Draft project" card. Existing ghost cover-draft cards get auto-cleaned.

## Root cause
All cover guards rely on `allCoverImageIds`, derived from the per-device `coverImages` localStorage map that loads asynchronously. When it isn't loaded yet (fresh load, other device, stale storage), the cover slips through and:
- shows as an "Uploaded image" working clip in the open Project (screenshot 1), and
- gets turned into a standalone "Draft project" by the orphan-draft backfill (screenshot 2).

The durable, cross-device truth is the database flag `generator_user_images.category = 'cover'` (already written at cover creation). The fix is to make every cover guard also honor that flag, not just the localStorage map.

## Changes (all in `src/modules/generator-ui/pages/DashboardPage.tsx`)

1. **Exclude covers from the workspace / project pending list** — `visibleUserImages` (around line 4765):
   - In both the project-snapshot branch and the active-workspace branch, also drop any image whose `category === 'cover'` (in addition to the existing `allCoverImageIds` check). This stops the cover from rendering as a "Working clip" anywhere outside the dedicated cover card.

2. **Keep covers out of legacy project backfill** — the loose-image claim loop (around line 4535): add `(i.category ?? 'general') !== 'cover'` to the filter so a cover is never pulled into another project's `projectSourceImages`.

3. **Make ghost-cover cleanup DB-driven, not localStorage-driven** — rework the cover-ghost cleanup effect (around lines 4404-4467):
   - Build `coverIds` from BOTH `Object.values(coverImages)` AND every `userImages` row with `category === 'cover'`.
   - Remove any `draft-orphan-img-*` / single-image draft whose only image is a cover from `draftEntries`, `draftSourceImages`, `imageDraftMap`, and tombstone the ids in `deletedDraftIds` (logic already present — just feed it the DB-derived `coverIds`).
   - Re-run when `userImages` changes (add to deps) and drop the one-shot `coverGhostCleanedRef` gate guarding against stale state, or relax it so it re-runs once covers are known from the DB. This auto-cleans the existing standalone cover "Draft project" cards.

4. **Self-heal legacy untagged covers**: when a cover is present in the `coverImages` map but its `userImages`/DB row still has `category !== 'cover'`, issue the `update({ category: 'cover' })` (this call already exists in the effect) so future sessions are protected purely by the DB flag.

## Out of scope / unchanged
- Cover creation flow (already tags `category: 'cover'`).
- Cover rendering inside its own project scope (`currentCover` via `coverScopeKey`) — already correct.
- Final Film merge cover injection — unchanged.
- No generation, auth, storage-policy, or schema changes. `category` column already exists.

## Verification
- TSC clean (`bun run tsc --noEmit`).
- Open a project, set a cover → it shows only in the cover card, not in Pending working clips, and no new "Draft project" appears in the Library.
- Reload with empty localStorage cover map → cover still does not appear in workspace/other projects (DB flag covers it).
- Existing standalone cover "Draft project" cards disappear after load and do not return after refresh.
</content>
<summary>Make film covers strictly project-scoped by guarding on the durable DB category='cover' flag (not just the async localStorage map): exclude covers from workspace/other-project pending lists and backfill, and auto-clean existing standalone cover "Draft project" cards.</summary>
</invoke>
