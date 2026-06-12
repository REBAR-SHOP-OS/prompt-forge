## Problem

When a new clip/film is generated, the central preview pins itself to that single new clip and shows a blank/grey player that plays nothing (see screenshot). The user wants the preview to **always** play all clips together, in playback order (the sequential auto-stitch).

## Root cause

In `DashboardPage.tsx`, the preview source is chosen by the `previewItem` memo (line ~3024). Its priority order is:

1. `lastMergedPreview` (Final Film)
2. `previewVideoId` → a single pinned clip
3. sequence preview (when 2+ playable clips exist)
4. single-clip fallback

On every generation the code calls `setPreviewVideoId(seededJob.id)` (lines ~4094 and ~4229). The seeded job is still **pending** (no `video.storage_path` yet, or its proxied URL isn't playable). Because `previewVideoId` has higher priority than the sequence, the preview gets locked onto this not-yet-ready clip → blank player, nothing plays, and the full sequence is never shown.

Secondary issue: `SequentialClipPlayer` has no error handling on the `<video>`. If one clip's source fails to resolve/play, it stalls on the loading spinner forever instead of advancing to the next clip.

## Fix

### 1. Stop pinning the preview to a freshly created clip (`DashboardPage.tsx`)
- In both generation flows (single-clip create ~line 4094 and multi-scene create ~line 4229), replace `setPreviewVideoId(seededJob.id)` with `setPreviewVideoId(null)` and ensure `previewDismissed` is false.
- Effect: after creating clips, `previewItem` naturally falls through to the **sequence preview** whenever 2+ playable clips exist, so the preview always plays every ready clip in order. With only one clip it still shows that single clip via the existing fallback.
- Clicking a card to focus a single clip still works (those `setPreviewVideoId(clip.id)` calls at ~7323/7456 are untouched).

### 2. Keep the auto-pin from re-locking elsewhere
- Verify no other create path re-pins after merge. Leave `lastMergedPreview` (Final Film) behavior unchanged — it should still take top priority when the user explicitly renders Final Film.

### 3. Make the sequential player self-healing (`SequentialClipPlayer.tsx`)
- Add an `onError` handler to the `<video>` that advances to the next clip (`goNext`) so a single bad/expired source never freezes playback.
- On error of a proxied URL, also call the hook's `reload()` once before skipping, so an expired-token URL gets re-resolved rather than permanently skipped. (Use the `reload` returned by `usePlayableVideoUrl`.)
- Ensure that when `resolvedVideoSrc` finishes loading the active video actually starts playing (re-trigger play in the autoplay effect on `resolvedVideoSrc` change, not just `current.id`).

## Outcome

- After generating new clips the preview immediately shows the full project as a sequential auto-stitched playback, in order — no more blank single-clip lock.
- A single failed/expired clip source no longer halts the preview; it retries once then continues.
- Manual single-clip preview (clicking a card) and Final Film preview are unchanged.

## Technical notes

Files touched:
- `src/modules/generator-ui/pages/DashboardPage.tsx` — change the two post-create `setPreviewVideoId(seededJob.id)` calls to clear the pin so the sequence preview becomes the default.
- `src/modules/generator-ui/components/SequentialClipPlayer.tsx` — add `onError` → reload-once-then-`goNext`; re-trigger play on resolved-src change.

No backend, schema, or business-logic changes.