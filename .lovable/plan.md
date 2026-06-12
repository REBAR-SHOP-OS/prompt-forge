## Goal

Add an icon button on each **Final Film** project card that converts it back into an editable **Draft** project, so the user can reopen a finished film, make changes, and finalize it again. This is the deliberate inverse of finalization (where a draft becomes read-only).

## Where

`src/modules/generator-ui/pages/DashboardPage.tsx`

- `renderCard(video, variant)` (around line 7907) renders Library cards. For `variant === 'final'` it currently shows only **Download** and **Delete** icon buttons (lines ~7965–8000).
- Finalization (lines ~5150–5290) creates the final by: storing source clips/images in `projectSourceJobs[mergedId]` / `projectSourceImages[mergedId]`, adding the merged entry to `mergedEntries` + `approvedIds`, deleting the draft, tombstoning draft ids, stripping `jobDraftMap`/`imageDraftMap`, and moving the cover to `coverImages[mergedId]`.

## The change

### 1. New icon button on final cards

In `renderCard`, inside the `variant === 'final'` action group (next to Download/Delete), add a third icon button — an **"Edit / reopen as draft"** control (e.g. `Pencil` / `Undo2` lucide icon, with `title` and `aria-label` "Reopen for editing"). On click: `event.stopPropagation()` then call a new `reopenFinalAsDraft(video)`.

### 2. New handler `reopenFinalAsDraft(video)`

This reverses finalization for that film, reusing the existing durable grouping mechanics:

1. Read the film's source snapshot: `projectSourceJobs[video.id]` (clips) and `projectSourceImages[video.id]` (images).
2. Pick the draft id from the clips' durable `draft_group_id` (`draftIdForGroupUuid(...)`) when present; otherwise mint a fresh `draft-<uuid>` via the same pattern used by `ensureActiveDraftId`.
3. Remove the final film so it no longer appears in the Library "Final" section: drop it from `mergedEntries` (+ `persistMerged`), remove its id from `approvedIds` (+ persist), and delete `projectSourceJobs[video.id]` / `projectSourceImages[video.id]` (+ persist).
4. Un-tombstone: remove the draft id and any `draft-orphan-img-*` ids for these items from `deletedDraftIds` so the draft is allowed to live again.
5. Recreate the draft snapshot: set `draftSourceJobs[draftId]` / `draftSourceImages[draftId]` from the source snapshot, and add a draft entry to `draftEntries` (persist all three).
6. Re-stamp ownership back to the draft: `jobDraftMap`/`imageDraftMap` entries for each clip/image -> `draftId`.
7. Restore the clips/images into the live workspace (mirror `resumeSelectedProject`): `mergeJob` clips into `generatedVideos`, add images to `userImages`, clear them from `workspaceHiddenJobIds`/`workspaceHiddenImageIds`, and add to `activeJobIds`/`activeImageIds` (persist).
8. Move the cover: if `coverImages[video.id]` exists, move it to `coverImages[draftId]` (persist).
9. Activate edit mode: `setActiveDraftId(draftId)` + persist, `setSelectedProjectId(null)`, clear preview/selection — this exits read-only snapshot view and lets the existing edit toolbar and Final Film flow operate on the draft again.

Optionally guard with a `window.confirm` ("Reopen this final film for editing? It will move back to Drafts.").

## Behavior summary

- Final card gets a new "reopen/edit" icon alongside Download and Delete.
- Clicking it removes the film from the Final section, recreates an editable Draft from the exact clips/images that produced it (cover included), restores them to the workspace, and selects that draft so the user can edit and re-finalize.
- No backend/schema changes — purely the existing localStorage-backed draft/library state machine, reusing durable `draft_group_id` grouping.

## Scope

- Single frontend file: `DashboardPage.tsx` (one new button in `renderCard`, one new handler).
- No backend, migrations, or business-logic-engine changes.
