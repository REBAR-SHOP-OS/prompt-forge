## Problem
On narrow aspect ratios (9:16, 1:1) the rendering preview shows an empty black band to the right of the video stage inside the bordered card.

## Root cause
The outer preview card uses `width: 'max-content'`, hoping to shrink-wrap the video stage. But the card has two children stacked vertically:

1. The video stage (correct width — driven by `aspectRatio` + `height`)
2. A footer row with the long prompt text + status pill

The footer uses `sm:flex-row sm:justify-between` and the prompt `<p>` has no `flex-1`/no width cap, so on long Persian prompts the footer becomes wider than the video stage. `max-content` then expands the card to the footer's width, leaving an empty band beside the (correctly-sized) video frame.

The previous `width: max-content` workaround only happened to look fine when prompts were short. It is not a structural fix.

## Root-cause fix
Hard-cap the outer card's width to **exactly** the video stage's computed width. The footer is then forced to wrap inside that width and can never expand the card.

Edits to `src/modules/generator-ui/pages/DashboardPage.tsx`:

1. Add a `ratioToWidth(r)` helper next to `ratioToHeight` that mirrors the same `min(...)` math but returns the stage **width** in CSS:
   - `9:16` → `min(calc(100vw - 26rem), calc(82vh * 9 / 16))`
   - `1:1`  → `min(calc(100vw - 26rem), 82vh)`
   - `16:9` → `min(calc(100vw - 26rem), calc(82vh * 16 / 9))`

2. On the outer preview card (around line 1704–1709), replace:
   ```
   style={{ width: 'max-content', maxWidth: 'calc(100vw - 26rem)' }}
   ```
   with:
   ```
   style={{ width: ratioToWidth(getRatioFor(previewVideo)), maxWidth: 'calc(100vw - 26rem)' }}
   ```

3. Tighten the footer (line 1794) so the prompt text wraps cleanly inside that fixed width:
   - Make the `<p>` `flex-1 min-w-0` so it shrinks instead of pushing.
   - Allow it to wrap (`whitespace-normal break-words`) so long Persian/English prompts wrap onto a second line rather than overflow.

## Result
The bordered card is now exactly the same width as the video frame for every aspect ratio, regardless of prompt length, status, or future footer additions. The empty band on the right of 9:16 / 1:1 previews is structurally impossible.

## Files
- `src/modules/generator-ui/pages/DashboardPage.tsx`
