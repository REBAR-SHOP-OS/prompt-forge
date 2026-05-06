# Fix: Black frames at the start of merged preview

## Problem

When clips are joined, the resulting video shows several seconds of black at the beginning (and can show short black gaps between clips). The user wants the merged preview to contain only the connected clips — no black filler.

## Root Cause

In `src/modules/generator-ui/lib/mergeVideos.ts`, the `MediaRecorder` is started **before** any video frame is painted to the canvas:

1. `recorder.start(250)` is called on line 301.
2. After that, the code runs the **pre-measure loop** (lines 327–330) that sequentially loads every clip via `loadVideo(...)` to compute `totalDuration`. This network/decoding work can take several seconds.
3. Only then does `video.play()` happen for the first clip.

During steps 2–3 the canvas still holds its initial black `fillRect`, so the recorder captures multiple seconds of black at the very start of the file.

A secondary, smaller source: between clips on a `cut` transition, `loadVideo` for the next clip happens after the previous clip's `ended` (canvas keeps last frame, which is fine), but if the next clip's `play()` is slow the same last frame just freezes — acceptable. The dominant issue is the startup black.

## Fix

Reorder the merge pipeline so the recorder only starts once the first frame is on the canvas:

1. **Pre-load all videos first** (move the pre-measure loop above recorder setup). Compute `totalDuration` and keep an array of preloaded `HTMLVideoElement`s so we don't reload them inside the main loop.
2. **Paint the first frame of clip 0** onto the canvas before recording (seek to 0, wait for `seeked`/`canplay`, draw once via `drawContain`).
3. **Then** create `MediaRecorder`, start it, start soundtrack playback, and begin the main play/render loop using the already-loaded videos.
4. Inside the main loop, reuse the preloaded `HTMLVideoElement`s instead of calling `loadVideo` again — this also removes any inter-clip loading gap.
5. Keep the existing tail `setTimeout(250)` so the last frame isn't truncated, but it will now contain the real last frame (not black).

## Files To Change

- `src/modules/generator-ui/lib/mergeVideos.ts` — reorder pipeline as above; remove the duplicate `loadVideo` call inside the main `for` loop; ensure `first` is part of the preloaded array.

No UI, contract, or backend changes required. No new dependencies.

## Acceptance

- Merged video starts immediately on the first frame of clip 1 (no black intro).
- Transitions between clips behave exactly as before (cut/fade/crossfade/slide/wipe/zoom).
- Soundtrack timing and clip-audio routing remain unchanged.
- Total duration ≈ sum of clip durations (minus transition overlaps), with no extra black padding.
