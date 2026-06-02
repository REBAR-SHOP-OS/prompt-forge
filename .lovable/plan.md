## Goal

Make the Scenario Writer (and Product Ad) dialogs handle every multi-scene duration the same way the 45s option already works: split into sequential 15-second scenes, show each as a numbered card with a correct time range, and enable "Send all to Pending".

- 30s → 2 sequential 15s scenes
- 45s → 3 sequential 15s scenes (already works)
- 135s → 9 sequential 15s scenes

The backend already produces the right number of scenes and uses the same 15s-scene prompt style for all of these durations, so no backend change is needed — this is a UI-only fix.

## What's wrong today

In both `ScenarioWriterDialog.tsx` and `ProductAdDialog.tsx`:

- `const SCENE_RANGES = ['0–15s', '15–30s', '30–45s']` is hard-coded to 3 ranges.
- `const isSplit = duration === 45 && scenes.length === 3` only treats 45s as a split result.
- The helper note only renders for `duration === 45` ("Will be split into 3 sequential 15s scenes").

So when a user picks 30s or 135s, the returned scenes are not shown as numbered scene cards, the time labels are missing/wrong, and the "Send all to Pending" action does not appear.

## Changes (both dialog files, identical edits)

1. Replace the fixed `SCENE_RANGES` array with a helper that builds ranges dynamically from the scene count, e.g. `0–15s`, `15–30s`, … `120–135s`.
2. Change the split detection to be multi-duration:
   - `isSplit = (duration === 30 || duration === 45 || duration === 135) && scenes.length > 1`
   - Use the dynamic range helper for each scene's label instead of indexing the old 3-item array.
3. Update the helper note under the Duration selector to show the correct count for the selected duration:
   - 30s → "Will be split into 2 sequential 15s scenes and sent as 2 cards."
   - 45s → "...3 sequential 15s scenes...3 cards."
   - 135s → "...9 sequential 15s scenes...9 cards."
4. The `Send all to Pending` button condition already keys off `isSplit && onSendScenes`, so generalizing `isSplit` automatically enables it for 30s and 135s.

## Notes

- `onSendScenes` in `DashboardPage.tsx` already maps an arbitrary number of scenes into `=== Scene N ===` blocks and chains them, so it needs no change.
- No edge function or database changes.

## Files

- `src/modules/generator-ui/components/ScenarioWriterDialog.tsx`
- `src/modules/generator-ui/components/ProductAdDialog.tsx`
