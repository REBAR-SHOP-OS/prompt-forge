# Reorderable, numbered history cards (oldest → newest)

Change the right-side "Recent outputs" panel so that:
1. The **first generated video appears at the top** and the newest at the bottom (currently it's reversed).
2. Each card displays a **sequence number** (1, 2, 3, …) matching its visual order.
3. The user can **drag-and-drop cards** to reorder them, and that order is used everywhere (preview navigation, merge, final film).

## Changes

### 1. Display order (oldest first)
File: `src/modules/generator-ui/pages/DashboardPage.tsx`

- The render list currently uses `generatedVideos` (sorted DESC by `created_at`). We will derive a new `displayedVideos` list in the aside that:
  - Filters out `deletedIds`.
  - Applies the user's manual order if present (see step 3); otherwise sorts ASC by `created_at` (oldest at top).
- Update `handleMergeAllVideos`: today it does `.slice().reverse()` on `completedSourceVideos` to get chronological order. Replace that with the new `displayedVideos` order (drop the `.reverse()`), so the merge always follows exactly what the user sees.

### 2. Numbering
- In the card render loop (`.map((video, index) => …)`), add a small numbered badge in the top-left corner of the thumbnail showing `index + 1`.
- Style: small rounded pill with `bg-black/60`, white text, `tabular-nums`, positioned absolutely over the `<video>` thumbnail (the thumbnail container becomes `relative`).

### 3. Drag-and-drop reordering
- Add a new state `manualOrder: string[] | null` (array of job ids). `null` means "use default chronological order".
- Implement lightweight HTML5 drag-and-drop (no new library) on each `<article>`:
  - `draggable`, `onDragStart` (store dragged id), `onDragOver` (preventDefault), `onDrop` (compute new order and update `manualOrder`).
  - Add a small grip handle icon (lucide `GripVertical`) on the right side of the card header for clear affordance.
- When new videos arrive, append their ids to `manualOrder` (if it exists) so user-set order is preserved while still showing new items at the bottom.
- When a card is deleted, remove its id from `manualOrder`.

### 4. Effect on existing features
- `previewVideo` selection logic stays the same (it uses ids, not order).
- The merge-all and final-film flows now use `displayedVideos` order, ensuring "what you see is what gets merged" — top card = first clip in the final film.
- "History count" badge stays as is (filtered length).

## Technical notes

- No new dependencies; native HTML5 DnD is sufficient for ~dozens of cards in a vertical list.
- `manualOrder` is component-local state (not persisted to DB) — refreshing the page returns to chronological order. We can persist later if requested.
- All changes are confined to `DashboardPage.tsx`.

## Out of scope
- Persisting custom order across reloads.
- Touch-drag on mobile (HTML5 DnD has limited mobile support; can add later with a library if needed).
