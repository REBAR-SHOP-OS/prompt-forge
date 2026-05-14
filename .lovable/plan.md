# Stabilize the Library panel

## Problem
Cards in the left **Library** panel sometimes disappear after a page reload, after Start Over, or after a Regenerate — and occasionally a card plays a different video than the one its prompt suggests. The user sees the Library shrink or change without taking any action.

## Root causes (in `src/modules/generator-ui/pages/DashboardPage.tsx`)

1. **Library data depends on `generatedVideos`, but `generatedVideos` is wiped on every mount** (line 1149: `setGeneratedVideos([])`). The Library reads from `visibleVideos = [...mergedEntries, ...generatedVideos]` filtered by `approvedIds`. The `approvedIds` set is persisted in localStorage, but the underlying job objects are not — so any approved single‑clip card vanishes after a reload. Only Final Film entries (`merged-*`, persisted in `mergedEntries`) survive, which matches what the user reports seeing.

2. **`approvedIds` keeps stale ids** for jobs that were deleted server‑side (Regenerate, Delete card, server retention). The count badge and panel become out of sync with reality.

3. **Regenerate silently un‑approves the clip** (lines 1353‑1361 remove the old id from `approvedIds`, and the new id is never re‑added). A saved clip therefore disappears from Library the moment the user regenerates it.

4. **`mergedEntries` is persisted as a JSON snapshot** with whatever URL was current at save time. If the source URL was a time‑limited signed URL, the Library card later plays a stale/wrong/blank video — explaining the “shows different videos” case.

## Fix (UI / state only — no backend changes)

### 1. Persist a self‑contained Library snapshot
Add a new persisted slice `librarySavedJobs: Record<string, JobDetail>` (key `library-saved-jobs:${userId}`) that stores a **frozen snapshot of every approved single‑clip job** (id, prompt, provider/model, durable `storage_path`, `thumbnail_url`, `created_at`, ratio).

- Write to it inside `toggleApproved` whenever a clip is approved; remove the entry when un‑approved.
- Also write to it whenever Final Film auto‑approves a `merged-*` id (keep that path going through `mergedEntries`, no change there).

### 2. Render Library from the snapshot, not from `generatedVideos`
Change the Library panel (around lines 3727 and 3747) and the count badge to read from:
```
const libraryItems = [...mergedEntries, ...Object.values(librarySavedJobs)]
   .filter(j => approvedIds.has(j.id))
   .sort(by created_at desc)
```
This makes Library independent of the workspace lifecycle (mount reset, Start Over, HISTORY hiding).

### 3. Prune dangling ids on hydrate
On mount, after hydrating `approvedIds`, `mergedEntries`, and `librarySavedJobs`:
- Drop any id from `approvedIds` that has no backing entry in either map.
- Persist the pruned set back to localStorage.
This stops ghost counts and stale entries from reappearing.

### 4. Keep approval across Regenerate
In `regenerateJob` (lines 1317‑1414):
- Capture `wasApproved = approvedIds.has(oldId)` and the saved snapshot before deleting.
- After the new job is created successfully, if `wasApproved`, add the **new** id to `approvedIds` and write a fresh `librarySavedJobs` entry for it (using the seeded job + same ratio). Remove the old id and old snapshot only after the swap.
- On failure, roll back so the original id stays approved (the server delete already happened, but the snapshot in `librarySavedJobs` keeps the card visible until the user re‑renders or removes it).

### 5. Refresh playable URLs on hydrate
For both `mergedEntries` and `librarySavedJobs`, on mount run a one‑time pass that:
- If `storage_path` looks like a Supabase Storage path, re‑resolve it via `supabase.storage.from(bucket).getPublicUrl(...)` to a fresh URL before rendering.
- Skips entries whose URL is already a durable public URL.
This eliminates the “card plays a different / blank video” symptom caused by stale signed URLs.

### 6. Keep `deleteCard` consistent
When `deleteCard` removes a Library item, also remove it from `librarySavedJobs` and persist. (No change to server behavior.)

## Out of scope
- No backend, edge function, RLS, or schema changes.
- No changes to Final Film generation, HISTORY panel logic, model selector, or Regenerate semantics other than preserving the approved flag.
- Existing `mergedEntries` and `approvedIds` storage keys stay where they are (backwards compatible).

## Verification
- Approve a clip → reload page → clip is still in Library and plays correctly.
- Approve a clip → Regenerate it → Library still shows one card with the new video, same prompt.
- Approve a clip → Start Over → Library is unchanged.
- Manually corrupt `approvedIds` with a fake id in localStorage → reload → count and list are clean.
- Final Film cards (`merged-*`) keep working exactly as today.
