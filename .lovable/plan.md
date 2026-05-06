## Goal

On each uploaded image card, remove the `5s / 10s / 15s` preset chips and keep **only** the custom number input — the user types any duration themselves.

## Change

Single file: `src/modules/generator-ui/pages/DashboardPage.tsx` (image-card duration row, ~line 2535).

Replace the radiogroup (presets + custom) with a single pill containing just the number input:

- `<input type="number" min=1 max=600>` styled as the active pill (white background, dark text).
- Same Enter / Escape / blur commit behavior.
- Same `updateImageDuration` clamp (1–600s).

The bottom composer (Wan video generation) is unchanged — it must stay 5/10/15 due to the model's hard constraint.

## Files touched

- `src/modules/generator-ui/pages/DashboardPage.tsx`