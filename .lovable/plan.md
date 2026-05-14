# Stabilize the Preview Area

## Problem

In the live preview area, the most-recent **Library** Final Film sometimes appears on its own — even when the user is viewing a different project (or hasn't selected anything). In the attached screenshot the header says "Showing project: Final merged video — 3 clips", but the preview is playing the unrelated "5 clips" Library entry. This makes the app feel unstable.

## Root Cause

In `src/modules/generator-ui/pages/DashboardPage.tsx`, the `previewItem` selector (lines ~1194-1219) has this fallback chain when no clip is explicitly selected (`previewVideoId == null`) and the user hasn't dismissed the preview:

1. If `playableSequenceClips.length >= 2` → show auto-stitched sequence ✅
2. **Else if `visibleVideos.length > 0` → show `visibleVideos[0]`** ⚠️
3. Else first image

The problem is step 2. `visibleVideos = [...mergedEntries, ...generatedVideos]` includes **every Final Film ever produced** (the entire Library), so its first element is always the newest merged Library item — even if it has nothing to do with the current workspace or the project the user is viewing. As soon as the workspace has fewer than 2 playable clips (e.g. right after Start Over, after deleting clips, after selecting an old project whose source clips aren't in the workspace, or during a fresh load before clips finish loading), the fallback leaks an unrelated Library video into the preview.

A second contributor: when `selectedProjectId` is set, the preview fallback ignores it entirely instead of preferring that project's own merged video.

## Fix

Rewrite the fallback so it stays inside the **current workspace context**:

1. **If `selectedProjectId` is set** → preview that exact merged project (find it in `visibleVideos` by id). Never substitute another Library entry.
2. **Else** → only consider clips that are actually in `displayedClips` (the right-rail working set). This naturally excludes Library-only `mergedEntries` that aren't part of the current chain.
   - If `playableSequenceClips.length >= 2` → sequence preview (unchanged)
   - Else if exactly one playable video clip exists in `displayedClips` → show it
   - Else if an image clip exists → show it
   - **Else → show nothing** (empty state) instead of pulling the newest Library item

This makes the preview a strict function of (a) what the user explicitly clicked, (b) the project they're viewing, or (c) the clips currently in their workspace — and never a function of "newest thing in Library".

## Scope

- File: `src/modules/generator-ui/pages/DashboardPage.tsx`
- Change: only the `previewItem` `useMemo` (~lines 1194-1219) and its dependency array. No backend, no other UI.
- No changes to Library list, Final Film merge, job creation, or any business logic.

## Verification

- Open a Library project with 3 clips → preview shows that project's merged video, not the newest 5-clip one.
- Start Over with Library populated → preview area is empty (no leaked Library video).
- Workspace with 1 in-progress clip → preview shows that clip / its progress, not a Library entry.
- Workspace with 2+ ready clips → sequential auto-preview still works (unchanged).
- Click a card → preview switches to that card (unchanged).
- Close preview (X) → stays closed (unchanged).
