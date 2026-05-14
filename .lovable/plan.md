# Remove the Regenerate Icon and All Its Commands

## What gets removed (permanently)

The circled icon in the screenshot is the **Regenerate clip from same prompt** button (a `RotateCcw` icon) shown on every clip card in the right-rail (HISTORY). It appears in two render paths in `src/modules/generator-ui/pages/DashboardPage.tsx`:

1. Large-card header actions — lines ~3719-3732
2. Compact-card row actions — lines ~3971-3984

## Changes

In `src/modules/generator-ui/pages/DashboardPage.tsx`:

1. Delete both `<button>` blocks above (the Regenerate buttons on the clip cards).
2. Delete the `regenerateJob` function (lines ~1424-1551) since it has no other callers after the buttons are removed.
3. Keep the `RotateCcw` import — it is still used by the top-bar **Start over** button (line 2723).
4. Keep the **Edit prompt and regenerate** (Pencil) button intact — the user only circled the rotate icon, not the pencil. (`editAndReuseJob` is a separate flow.)

No backend or contract changes. No other UI changes.

## Verification

- Clip cards in HISTORY no longer show the rotate (regenerate) icon.
- Start Over button at the top still shows its rotate icon and works.
- Edit (pencil) action on cards still works.
- TypeScript build is clean (no unused-symbol errors).
