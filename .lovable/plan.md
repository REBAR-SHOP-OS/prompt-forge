## Problem
The multi-card stitched preview (`SequentialClipPlayer.tsx`) stutters during playback. The fix targets three root causes in that component only — no changes to generation, Final Film, audio mixing, or single-clip preview.

## Root causes found

1. **Concurrent video decoding (main cause).** A hidden double-buffer `<video src={nextResolvedSrc} preload="auto">` is mounted for the *entire* duration of the current clip (lines ~497–509). `preload="auto"` makes the browser download **and** spin up a second decode pipeline for the next clip while the current one is playing. Two simultaneous decoders + bandwidth contention is exactly what causes frame stutter, and it gets worse with more connected cards.

2. **Whole-tree re-render on every tick.** `onTimeUpdate` (and the image-clip `requestAnimationFrame` loop) call `setGlobalTime(...)` on every frame/tick (lines ~285–293, ~454–461). That re-renders the full player — active `<video>`, prefetch `<video>`, scrub bar, and the wavesurfer soundtrack subtree — many times per second, competing with the decoder for main-thread time.

3. **Duplicate metadata probing.** `useTotalDuration` (lines 17–54) and the duration-preload effect (lines 156–177) each create their own throwaway `<video>` elements for every clip to read metadata, doubling the metadata-fetch work on open.

## Fix

**A. Make the next-clip prefetch non-competing**
- Only mount the hidden prefetch `<video>` during roughly the **last ~2.5s** of the current clip instead of the whole clip, and keep it a single element. Drive this off a ref-based "near end" flag updated in the existing time handler (no new per-frame React state).
- Keep `preload="auto"` but scope it to that short window so the active clip owns the decoder/bandwidth for most of playback while still eliminating the boundary gap.

**B. Decouple the playhead from React render**
- Stop calling `setGlobalTime` on every `timeupdate`/rAF. Instead store the live film time in a ref and update the scrub-bar fill width, the playhead knob `left`, and the current-time label **directly via DOM refs** inside the existing rAF/timeupdate handlers.
- Keep React state only for things that truly change structure: the active clip `index`, `isPlaying`, and `clipDurations`. On clip change / seek / pause, sync the displayed time once.
- This removes the per-frame re-render of the `<video>` + wavesurfer subtree, which is the second-biggest source of stutter.

**C. De-duplicate metadata probing**
- Have `useTotalDuration` reuse the `clipDurations` map already populated by the preload effect (and the active video's `onLoadedMetadata`) instead of creating its own parallel set of `<video>` elements. One metadata path, half the element churn on open.

## Validation
- `tsgo` typecheck must stay clean.
- Flush HMR and drive the stitched preview (2+ connected cards) with Playwright against localhost: confirm smooth playback, correct scrub-bar/time movement, working seek + play/pause, clean clip-to-clip transitions, and no console errors.

## Files touched
- `src/modules/generator-ui/components/SequentialClipPlayer.tsx` (only)