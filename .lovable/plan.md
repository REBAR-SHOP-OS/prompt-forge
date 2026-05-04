## Goal

On the dashboard:

1. **Delete on every card** — each render card (right "Recent outputs" panel and left "Library" panel) gets a small trash icon that removes it.
2. **Merge / concatenate icon** — a new icon at the top of the right panel that, after several videos have been generated, joins all completed videos (in order) into a single final video, makes it downloadable, and **automatically saves the final merged video into the left "Saved videos / Your library" panel**.

Pure frontend work — no backend changes. Merging happens entirely in the browser.

## UX Behavior

### Delete (per card)
- Small trash icon on every card in **both** the right "Recent outputs" panel and the left "Library" panel.
- Click → confirm via a tiny inline prompt (single click + `confirm()` is fine for v1).
- Removes the card from view (locally hidden) and removes it from the approved set if present.
- Persisted in `localStorage` as a `deletedIds` set keyed per user (`deleted-videos:<userId>`), same pattern as `approvedIds`. The job still exists server-side but is filtered out everywhere on the client.
- If the deleted card is currently the main preview, the preview falls back to the next available video.

### Merge all videos (right panel header)
- New `Combine` icon (lucide `Combine` or `Layers`) appears in the right panel header next to the existing `+` button.
- **Enabled only** when there are at least **2 completed** videos with `video.storage_path`.
- Click flow:
  1. Disable button, show small spinner + "Merging…" label.
  2. In-browser, fetch each completed video's `storage_path` as a `Blob`, draw frame-by-frame to a `<canvas>` and capture via `MediaRecorder` → produces one `video/webm` blob.
  3. Upload the merged blob to Supabase Storage in a new bucket (e.g., `merged-videos`) under `<userId>/merged-<timestamp>.webm`, get the public URL.
  4. Insert a synthetic "merged" entry into `generatedVideos` state with `status: 'completed'`, `input_prompt: 'Final merged video — N clips'`, and a fake `video.storage_path` pointing at the uploaded URL.
  5. Add its id to `approvedIds` so it appears in the **left "Saved videos / Your library"** panel automatically.
  6. Trigger an immediate browser download of the merged file.
- Persist merged-video metadata in `localStorage` (`merged-videos:<userId>`) so it survives reloads without backend changes.

### Empty / disabled states
- Merge button shows tooltip "Need at least 2 finished videos" when fewer than 2 completed clips exist.

## Technical Changes (single file + 1 new helper file + 1 storage bucket)

### 1. `src/modules/generator-ui/pages/DashboardPage.tsx`
- Add state `deletedIds: Set<string>` + `mergedEntries: MergedEntry[]`, both persisted in `localStorage` keyed by `userId`.
- Filter `generatedVideos` for display: `visibleVideos = generatedVideos.filter(v => !deletedIds.has(v.id))`. Use `visibleVideos` in both panels.
- Inject `mergedEntries` into the displayed list as virtual `JobDetail`-shaped items (always `status: 'completed'`, never polled).
- Add `Trash2` icon button on each card in both panels (right panel: next to bookmark; left panel: same row).
- Add `Combine` icon button in the right panel header (line ~661 area, next to the `+` button).
- New `handleMergeAllVideos` function that orchestrates fetch → canvas concat → upload → state update.

### 2. New helper: `src/modules/generator-ui/lib/mergeVideos.ts`
- Pure utility: `mergeVideoUrls(urls: string[], onProgress?: (n) => void): Promise<Blob>`
- Implementation: sequentially load each URL into a hidden `<video>`, paint frames onto a shared `<canvas>` at ~30fps, capture canvas stream with `MediaRecorder({ mimeType: 'video/webm;codecs=vp9' })`, return final blob.
- Audio is dropped in v1 (canvas/MediaRecorder audio mux is fragile across browsers). We can add audio in a follow-up if needed.

### 3. Storage bucket (one migration)
- Create public bucket `merged-videos` with RLS allowing authenticated users to insert/select their own files (path prefix = `auth.uid()/...`).

## What stays unchanged
- Edge functions, job orchestrator, all DB tables for jobs, polling, composer, generation modes, contracts.
- Bookmark/approve flow and `approvedIds` storage stay exactly as today; merged videos are simply auto-added to that set.

## Acceptance
- Every card (both panels) has a working trash icon; deleted cards stay gone after reload.
- A "merge" icon appears in the right panel; disabled until ≥2 completed clips exist.
- Clicking merge produces one downloadable `.webm` and a new card in the **left "Saved videos / Your library"** panel labeled as the final merged video.
- Merged video persists across reloads and can itself be deleted from the library.
