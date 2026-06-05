# Fix: draft items leaking into another project's Final Film

## The problem

You finalized a new video and an old image + old video from a previous draft were silently pulled into your project. Draft projects must be fully isolated — this should never happen.

## Root cause

All project/draft state lives in the browser (localStorage), keyed per user, inside `DashboardPage.tsx`. There is an authoritative "current workspace membership" set — `activeJobIds` (videos) and `activeImageIds` (images) — that is stamped when you create/upload an item and cleared on Start Over and after Final Film.

The bug is an **inconsistency in how this membership set is enforced**:

| Path | Videos | Images |
|------|--------|--------|
| Workspace display | filtered by `activeJobIds` ✅ | NOT filtered by `activeImageIds` ❌ |
| Final Film merge set | NOT filtered by `activeJobIds` ❌ | NOT filtered by `activeImageIds` ❌ |

Because the image display (`visibleUserImages`) and the Final Film merge set (`handleMergeAllVideos`, default-workspace branch) only exclude *hidden* and *claimed* items — instead of requiring membership in the active manifest — any leftover image or video that escaped a snapshot/hidden bucket (timing race, legacy item, an old draft that was never explicitly closed via Start Over) gets swept into the new film. Final Film then permanently "claims" those stray items into the finalized project, baking the leak in.

## The fix

Make `activeJobIds` / `activeImageIds` the single authoritative scope for the **default workspace**, applied symmetrically to images and videos, in both display and merge.

### `DashboardPage.tsx`

1. **`visibleUserImages`** (default-workspace branch): add `&& activeImageIds.has(i.id)` to the filter, mirroring how `displayedVideos` already gates videos on `activeJobIds`. Add `activeImageIds` to the dependency array.

2. **`handleMergeAllVideos`** (default-workspace branch, no selected project): gate the video loop on `activeJobIds.has(v.id)` so only clips actually in the current workspace are eligible. The image side already uses `visibleUserImages`, which now carries the `activeImageIds` filter, so images are covered automatically.

3. **`resumeSelectedProject`**: when restoring a draft's snapshot into the live workspace, also mark each restored clip/image active (`markActiveJob` / `markActiveImage`), not just un-hide them. This keeps reopening a draft working correctly now that membership is strictly enforced — the resumed draft's items become the active manifest, and nothing else can join the film.

## Why this is the principled fix

After this change, an item can only enter a Final Film if it was explicitly created, uploaded, or resumed into the *current* workspace session. Items belonging to any other draft are never in the active manifest, so they are structurally impossible to merge in — closing the leak at its source rather than patching one symptom. No backend/schema changes are needed; this is purely client-side workspace-scoping logic.

## Verification

- Build passes (run automatically).
- Manual: create a draft (clip + image), Start Over, create a new project, Final Film → only the new project's items appear; the old draft's clip/image stay isolated in their own Drafts entry.
- Reopen an existing draft and confirm its items still populate the workspace and finalize correctly.
