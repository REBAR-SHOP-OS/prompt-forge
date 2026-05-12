# Fix: Final Film must connect ALL history cards

## Problem

When you click "Final Film", sometimes some cards from the History panel are missing from the merged output. Reproduces reliably whenever you've edited (trim / Apply Changes) at least one video card — the others get silently dropped.

## Root cause

In `src/modules/generator-ui/pages/DashboardPage.tsx`, inside `handleMergeAllVideos` (around lines 1918–1929):

```ts
const baseClips = displayedClips.filter(...)        // all eligible clips
const editedVideoCount = baseClips.filter(c => c.kind === 'video' && editedJobIds.has(c.id)).length
const eligibleClips = editedVideoCount >= 1
  ? (baseClips.some(c => c.kind === 'image' || editedJobIds.has(c.id))
      ? baseClips.filter(c => c.kind === 'image' || editedJobIds.has(c.id))   // <-- drops non-edited videos
      : baseClips)
  : baseClips
```

As soon as **one** video card is marked "edited" (any trim/Apply), the merge silently filters out every other video card that has not been edited. Images are kept, but plain unedited video cards from History disappear from the Final Film. That is exactly the symptom — "some cards are not connected".

There is no product reason for this behavior; an edit on one card should not exclude other finished cards. After server-side Apply Changes, the unedited cards still point at perfectly valid storage paths.

## Fix

Remove the edited-only branch entirely. Final Film always merges every clip currently shown in the History column, in display order:

```ts
const eligibleClips = displayedClips.filter((c) =>
  c.kind === 'image' ? true : completedVideoIds.has(c.id) && c.job.video?.storage_path,
)
```

That is the same set the user sees and can drag-reorder in the right column, so the merged output matches the visible timeline 1:1.

Also drop the now-obsolete single-card guard branch that referenced `editedJobIds` (`hasEdit`). The single-card path keeps the existing rule "needs music/voiceover" — without that, a single-clip "merge" is just a re-encode.

## Out of scope

- No backend / DB / storage / RLS changes.
- `editedJobIds` is still used elsewhere (preview labels, Apply state) — leave it alone.
- Drag-reorder, transitions, soundtrack, image-still conversion, project snapshots: unchanged.
- One file touched: `src/modules/generator-ui/pages/DashboardPage.tsx` — about 10 lines inside `handleMergeAllVideos`.

## Verification

1. Generate 3 video cards, do not edit any → Final Film → all 3 appear, in order.
2. Generate 3 video cards, edit only card #2 → Final Film → all 3 appear, with #2 using its edited file (server already replaced storage_path on Apply).
3. Mix videos + images → all stitched in display order.
4. Single card with music → still works.
5. Single card without music or edit → blocked with the existing helper message.
