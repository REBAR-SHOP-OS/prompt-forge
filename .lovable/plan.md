## Goal

1. The Drafts section should list **every existing unfinalized clip/image in the system** as a draft project — not just chains that were active after the auto-snapshot feature shipped.
2. Deleting a draft card must **permanently remove** the underlying clips, images, and jobs (server + local), not just hide the snapshot.

---

## Current behavior

- `draftEntries` are only created by the live auto-snapshot `useEffect` while the workspace is active. Anything generated before the feature, or any orphan clip outside an active session, never shows up.
- Deleting a `draft-*` card today only drops the local snapshot in `localStorage`. The underlying jobs/images stay on the server and re-appear elsewhere.

---

## Plan

### 1. Backfill historical drafts (DashboardPage.tsx)

Add a one-shot backfill effect that runs after `generatedVideos` + `userImages` + `mergedEntries` + `librarySavedJobs` have hydrated:

- Build a `claimedIds` set from:
  - every clip id inside `projectSourceJobs` (Final Film snapshots),
  - every clip id inside existing `draftSourceJobs`,
  - every `mergedEntries`/`librarySavedJobs` job id (finalized clips),
  - same for images via `projectSourceImages` + `draftSourceImages`.
- For every `generatedVideos` job NOT in `claimedIds` AND with a usable `video.storage_path`, create one synthetic draft project:
  - id = `draft-orphan-<jobId>` (deterministic so reruns don't duplicate),
  - snapshot in `draftSourceJobs[draftId] = [job]`,
  - entry in `draftEntries` (same shape as the auto-snapshot writer).
- Same for orphan `userImages` → `draft-orphan-img-<imageId>`.
- Persist via the existing `persistDraftEntries` / `persistDraftSourceJobs` / `persistDraftSourceImages` helpers.
- Guard: only backfill ids not already present in `draftEntries` so user-deleted drafts don't resurrect (we track deletions in step 3).

### 2. Track permanently-deleted draft ids

Add a `deletedDraftIds: Set<string>` persisted under `deleted-draft-ids:<userId>`. The backfill step skips any draft id (or its source clip/image id) listed here, so deletion is final across refresh.

### 3. Permanent delete on draft card delete (`deleteCard`)

When `jobId.startsWith('draft-')`:

1. Read snapshot clips from `draftSourceJobs[jobId]` and images from `draftSourceImages[jobId]`.
2. For each clip job: call the existing server-side job delete path (same code the non-draft branch uses for `generatedVideos` removal — `jobs-delete` edge function + state cleanup) so credits/storage stay consistent.
3. For each image: call the existing user-image delete path (server delete + remove from `userImages`).
4. Remove the draft entry + both snapshot maps (current behavior).
5. Add the draft id AND every underlying clip/image id to `deletedDraftIds` and persist, so the backfill never recreates them.
6. Keep the confirm() prompt; update its text to make permanence clear (e.g. "Delete this draft and all its clips permanently?").

### 4. UI

No new components. The existing Drafts list (`draftItems.map(renderCard(..., 'draft'))`) already renders these entries — the backfill just adds more cards. Clip count badge keeps working because `draftSourceJobs[id].length + draftSourceImages[id].length` is populated.

---

## Files touched

- `src/modules/generator-ui/pages/DashboardPage.tsx` — backfill effect, `deletedDraftIds` state + persistence, expanded `deleteCard` draft branch.

No backend changes; deletion reuses the existing job/image delete code paths already wired for the non-draft Library cards.

## Verification

- Refresh the page: every previously orphan clip/image appears as its own draft project card in the Drafts section, with the correct thumbnail and clip count.
- Open a backfilled draft → workspace shows that clip/image with the locked aspect ratio.
- Delete a backfilled draft → confirm prompt → card disappears, underlying clip vanishes from any other view, refresh does not bring it back.
- Finalizing a draft into a Final Film still clears it (existing behavior preserved).