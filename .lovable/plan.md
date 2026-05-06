## Goal

When the user has at least one generated clip in the current chain, the aspect ratio of all subsequent clips must match the **first clip's aspect ratio**. The other two ratio buttons should be visibly locked (disabled) so the user can only continue the chain in the same dimensions (e.g., if the first card is 9:16, only 9:16 stays selectable; 1:1 and 16:9 are locked).

This applies symmetrically: if the first clip is 1:1, only 1:1 is allowed; if 16:9, only 16:9.

The lock releases automatically when the chain is cleared (Start Over) or when no completed/active clips remain.

## Behavior

1. Compute a `lockedRatio` from the existing chain:
   - Look at `generatedVideos` (excluding deleted), pick the **oldest non-deleted** entry, and read its aspect ratio via the existing `getRatioFor(...)` helper (which already falls back to the asset's `aspect_ratio`, then to the current selector).
   - If there are zero clips in the chain → `lockedRatio = null` (user is free to choose).
   - If there is one or more → `lockedRatio = ratio of the first clip`.

2. When `lockedRatio` is set:
   - Force `aspectRatio` state to `lockedRatio` (sync via effect so persisted localStorage value can't override).
   - In the ratio radio group (lines 2480–2506), the two non-matching buttons render as **disabled**: greyed out, `cursor-not-allowed`, `aria-disabled="true"`, and a small lock icon appears next to the label. Clicking does nothing.
   - The active (locked) button gets a subtle lock icon too, with a tooltip: "Locked to match the first clip in this chain (9:16). Start Over to change."

3. Start Over already calls `setPreviewVideoId(null)` and clears the chain — once the chain is empty the lock auto-releases and all three ratios become selectable again.

4. The continuation seed flow (`editAndReuseJob`, auto-seed in line ~1197) does not need to change — generation already uses the current `aspectRatio` which will now equal the locked ratio.

## Technical changes

**File:** `src/modules/generator-ui/pages/DashboardPage.tsx`

1. Add a `lockedRatio` memo near the existing `completedSourceVideos` memo (~line 674):
   ```ts
   const lockedRatio = useMemo<Ratio | null>(() => {
     const chain = visibleVideos.filter(v => !deletedIds.has(v.id))
     if (chain.length === 0) return null
     // oldest first — visibleVideos is newest-first, so take the last
     const first = chain[chain.length - 1]
     return getRatioFor(first)
   }, [visibleVideos, deletedIds])
   ```

2. Add an effect to force-sync the selector when locked:
   ```ts
   useEffect(() => {
     if (lockedRatio && aspectRatio !== lockedRatio) {
       setAspectRatio(lockedRatio)
     }
   }, [lockedRatio, aspectRatio])
   ```

3. In the ratio radio group (lines 2480–2506), per-option:
   - `const isLocked = lockedRatio !== null && opt.value !== lockedRatio`
   - Add `disabled={isLocked}`, `aria-disabled={isLocked}`.
   - Skip `setAspectRatio` when `isLocked`.
   - Apply muted classes when locked: `opacity-40 cursor-not-allowed pointer-events-none`.
   - Render a small `Lock` icon (from `lucide-react`) next to the label when `isLocked`, and on the active locked button (different tooltip).
   - Update `title` to explain the lock.

## Out of scope

- No DB / migration changes.
- No change to merge logic — `mergedRatio` already reads from the first clip.
- No change to backend.
