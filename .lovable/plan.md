## Goal

Two refinements to the History column on the dashboard:

1. **Continuity prompt** — when the user clicks the **+** button to add a new card, the prompt for the new card must continue the *content* of the previous card (not just reuse its last frame as the Start image).
2. **Numbered cards in chronological order** — show a sequence number on each History card. Card **#1** is the first one created, then **#2**, **#3**… The first card sits at the **top** of the column and newer cards appear **below** it.

Everything else (start/end frame logic, merging, library, delete, edit-and-reuse) stays as-is.

---

## Changes

### 1. History order: oldest → newest (top → bottom)

Currently `mergeJob` and `hydrateJobs` sort `created_at` descending (newest first). Flip both to ascending so card #1 is rendered at the top.

The "preview latest by default" behavior in the empty-preview-id branch should pick the **last** completed video instead of the first, so the most recent render still auto-previews.

**File:** `src/modules/generator-ui/pages/DashboardPage.tsx`
- `mergeJob` — sort ascending by `created_at`.
- `hydrateJobs` — sort ascending by `created_at`.
- `previewVideo` fallback — pick the last item with a `storage_path` (newest), not the first.
- `handleAddVideoCard` — "previous render" lookup currently uses `find(...)` which returns the first match; with ascending order this would return the **oldest**. Switch to scanning from the end (`findLast` or reverse-iterate) so it grabs the **newest completed** card as the seed for continuation.

### 2. Numbered card badge

Add a small circular badge in the top-left corner of each History card showing its 1-based index (`#1`, `#2`, …). Numbering is based on chronological order (creation time), so it's stable: the first card forged is always **1**, even after deletions of later cards.

Implementation:
- Compute `chronologicalIndex` per visible card from the ascending-sorted History list (1-based).
- Render a small badge overlaid on the video thumbnail (top-left), styled like the existing badges (white/10 border, dark bg, tabular-nums).

### 3. Continuity prompt on **+**

`handleAddVideoCard` already auto-seeds the previous video's last frame as the Start frame. Extend it to also pre-fill the prompt input with a *continuation* of the previous card's prompt.

Approach (no AI call — keep it instant and offline):
- Take the previous card's `input_prompt`, strip the `Attached files:` block that `buildPromptWithUploadedFiles` appends.
- Build a Persian continuation seed:
  `«ادامه: {previous prompt}» — صحنه را به‌صورت طبیعی از همان‌جا که قبلی تمام شد ادامه بده.`
- Set `promptText` to this seed so the user sees it pre-filled and can tweak before hitting Prompt.
- The previous card's last frame continues to be uploaded as the Start frame (existing behavior), so the visual continuity is preserved alongside the textual continuity.

If there is no previous completed card, leave the prompt empty (current behavior).

---

## Technical details

```text
History column (top → bottom)
┌─────────────────────────┐
│ [#1]  first render      │  ← oldest
│ [#2]  second render     │
│ [#3]  third render      │  ← newest, auto-previewed
└─────────────────────────┘
```

Files touched: only `src/modules/generator-ui/pages/DashboardPage.tsx`.

No backend, schema, or edge-function changes required.
