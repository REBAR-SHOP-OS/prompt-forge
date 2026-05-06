## Goal
Make the right "Clips/History" column wider so each card (thumbnail + prompt + 5 action icons) is fully visible on medium+ screens, without breaking the preview area or chat composer that currently reserve space using `26rem`.

## Changes (all in `src/modules/generator-ui/pages/DashboardPage.tsx`)

### 1. Widen the right History panel
Current (line 1920):
```
sm:w-80 lg:w-72 xl:w-80   // 320 / 288 / 320 px
```
New: scale up on larger screens so card actions don't crowd the prompt.
```
sm:w-80 lg:w-80 xl:w-96 2xl:w-[26rem]
// 320 / 320 / 384 / 416 px
```

### 2. Keep the left Library panel symmetric
Line 2190 — apply the same width ramp so left/right panels stay visually balanced and the preview stays centered.

### 3. Update reserved width for the preview & soundtrack dialog
Replace the hard‑coded `26rem` (which assumes 2 × 13rem panels) with a value matching the new max panel width plus margin. Affected lines:
- 354–356, 359–361 (`ratioToHeight` / `ratioToWidth`)
- 1804, 1813 (soundtrack dialog max widths)

New reservation:
```
calc(100vw - 56rem)   // ~28rem per side at 2xl, leaving room for gutters
```
With a sensible floor on small screens via the existing `min(...)` wrappers (already in place).

### 4. Update the chat composer max width
Line 2338 currently uses `calc(100vw - 26rem)` for the composer; bump to `calc(100vw - 56rem)` so it does not slide under the wider right panel on large screens.

## Why this is safe
- All changes are CSS class / inline‑style tweaks — no logic, no data, no API.
- The dynamic preview height system (ResizeObserver tied to `composerRef`) keeps preview from going under the chat box; only the horizontal reservation changes.
- Smaller breakpoints (`sm`, default) are untouched, so mobile/tablet layout is preserved.
- Card markup itself is unchanged; the additional column width simply gives the existing `flex` row breathing room so `Pencil`, `Trash2`, `Bookmark`, drag handle, and prompt no longer compete for space.

## Out of scope
- No changes to card internals, colors, fonts, or icon set.
- No changes to backend / data fetching.