## Goal

On each uploaded image card, the Duration field must show **no number at all** by default. The user should see only an empty box (with a faint placeholder), and the value appears only after they type it themselves.

## Current behavior

The input shows `3` (or whatever default came from the DB) pre-filled. The user wants no pre-filled value visible.

## Change

Single file: `src/modules/generator-ui/pages/DashboardPage.tsx` (image-card duration input, ~line 2541).

1. Replace `defaultValue={img.still_duration_seconds || 3}` with `defaultValue=""` so the field renders empty on mount.
2. Add `placeholder=" "` (a thin dot or empty) so nothing numeric is visible.
3. Widen the input slightly (`w-12`) so a placeholder doesn't get clipped.
4. On `Escape` / empty `onBlur`, **do not** repopulate with `3` — leave the field empty (just don't trigger an update).
5. Keep the existing commit logic: when the user types a number and blurs/presses Enter, call `updateImageDuration` (which already clamps 1–600).
6. Keep the stable `key` so the field resets to empty when the image changes, but no longer displays the stored seconds.

### Important — preserve film rendering

`still_duration_seconds` is still used downstream (line 1677 and 2192) when building the final film. The DB column already has a value (existing rows default to 3s), and `updateImageDuration` only fires when the user types a real number. So:

- Visually: the input is always empty until the user types.
- Functionally: the stored duration on the row is unchanged unless the user enters a new value.

This satisfies "no number shown — only what the user types" without breaking film generation for images where the user never sets a duration.

## Files touched

- `src/modules/generator-ui/pages/DashboardPage.tsx` (one input block, ~30 lines)

The bottom video-generation composer (5/10/15s presets for the Wan model) remains unchanged.
