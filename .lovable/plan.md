# Make soundtrack playback + section selection obvious

## Current behavior

The "Soundtrack for Final Film" dialog already has the requested capabilities, but they're hard to see:

- The **Play / Pause button** for the uploaded music exists, but it's a tiny, very dim circle in the bottom-left of the waveform — easy to miss against the dark background.
- The **green region on the waveform IS the selection** that gets applied to the entire Final Film. Dragging the edges of that green box changes the start/end. The merge pipeline already uses `musicRange` as `audioOpt = { src, startSec, endSec }` and loops that exact section across all clips.
- A **Preview** button in the footer plays only the selected range.

So the feature works — the user just can't tell. The fix is to make playback and selection visible and self-explanatory inside the dialog.

## Changes

Edit only `src/modules/generator-ui/components/SoundtrackWaveform.tsx`:

1. **Make the Play / Pause button clearly visible**: bigger (h-8 w-8), brighter border (`white/25`) and background (`white/10`), white icon.
2. **Add a "Play selection" button** right next to it (emerald-tinted to match the green region) that plays only the chosen section and stops at the end. This duplicates the footer "Preview" inline so it's discoverable.
3. **Brighten the time counter** (`text-zinc-200` instead of `text-zinc-400`) so `0:00 / 2:33` is readable.
4. **Add a one-line hint** under the controls: "Drag the edges of the green box to choose the section. That section will play across the entire Final Film." — explains in plain words that the selection drives the final film soundtrack.

No changes to the dialog footer, the merge pipeline, the `musicRange` state, or the contract — the selection and looping behavior already work end-to-end.

## Files

- `src/modules/generator-ui/components/SoundtrackWaveform.tsx` (controls + hint only)

## Acceptance

- The play / pause button is clearly visible and plays the full uploaded track.
- A visible "Play selection" button plays only the highlighted green region and stops at its end.
- Dragging the edges of the green region updates the selection and the time read-out.
- The selected range is what the Final Film uses (unchanged behavior).
