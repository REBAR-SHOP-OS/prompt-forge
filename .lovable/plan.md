## Goal

After a successful **Final Film** merge, the resulting video must be registered in **Your Library** (left panel) so the user can open / play / download / delete it later. Pending must stay untouched — no new card is ever created in Pending.

## Where to change

Single file: `src/modules/generator-ui/pages/DashboardPage.tsx`, inside the Final Film merge handler (around line 2980, right after `publicUrl` is obtained and before the transient-preview block at 2984–2992).

## Behavior

1. Build a `JobDetail`-shaped entry for the merged film:
   - `id`: `` `merged-${Date.now()}-${crypto.randomUUID().slice(0,8)}` ``
   - `status`: `'completed'`
   - `input_prompt`: a friendly title (e.g. `'Final Film'` + clip count)
   - `provider_key`/`model_key`: `'final-film'` / `'merge'`
   - `created_at`/`updated_at`: `new Date().toISOString()`
   - `requested_aspect_ratio`: `mergedRatio`
   - `video`: `{ id: <same merged id>, storage_path: publicUrl, thumbnail_url: null, aspect_ratio: mergedRatio, duration: null }`

2. Append it to `mergedEntries` via `setMergedEntries((prev) => { const next = [entry, ...prev]; persistMerged(next); return next })` — this is what already powers the Library panel and persists across reload.

3. Add the new id to `approvedIds` (and persist to `approvedStorageKey`), because `libraryItems` is filtered by `approvedIds.has(...)`.

4. Snapshot the source clips into `projectSourceJobs[mergedId]` (and persist) so selecting the library card later shows the correct HISTORY (mirrors the existing legacy fallback at line 1305).

5. Keep the existing transient preview behavior (`setLastMergedPreview(...)`) — overlay still appears immediately. We just now ALSO save to Library.

## Non-goals / guards

- ❌ Do NOT push to `generatedVideos` (Pending) — Pending must remain untouched per prior directive.
- ❌ Do NOT create a backend job row. Final Film is client-side; Library has always rendered local merged entries from `localStorage`.
- ❌ Do NOT change `mergeVideoUrls` or upload logic.
- Failure path stays the same: nothing is added to Library if the upload throws.

## Verification

- Build passes.
- After clicking **FINAL FILM**: the preview overlay shows, AND the Library badge increments by 1, AND opening the library shows the new film as the newest entry with working play/download.
- Pending count is unchanged (still 6 in the screenshot scenario).
- Reload: the new film is still in the Library.
- Delete from Library: removes it from `mergedEntries`, `approvedIds`, and `projectSourceJobs` (existing `deleteCard` already handles all three).
