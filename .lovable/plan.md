## Problem

In the soundtrack dialog, the user picks a green selection (e.g. 0:05–0:26) and clicks **Done**. The Preview button correctly plays only that window, but the rendered Final Film does NOT strictly respect this window — the soundtrack often starts from the beginning of the file or overshoots past the selected end before looping. The user's request: the audio applied to the merged film must come **exactly** from the selected segment, nothing before, nothing after.

## Root cause

In `src/modules/generator-ui/lib/mergeVideos.ts` the soundtrack playback uses:

1. `soundtrackEl.loop = true` — when the audio reaches the file's natural end, the browser jumps to `0` (not to `winStart`), so the un-selected intro of the file plays until the next `timeupdate` correction.
2. A `timeupdate` listener to clamp playback inside `[winStart, winEnd]`. But `timeupdate` only fires roughly every 200–250 ms, so playback can overshoot `winEnd` audibly before the listener resets `currentTime`.
3. There is a long async gap between setting `soundtrackEl.currentTime = winStart` (line 283) and the actual `play()` (line 353) — preloading clips and starting the recorder happen in between. Some browsers reset `currentTime` of an unplayed `<audio>` element when its readyState changes, so the playhead is no longer guaranteed to be at `winStart` when playback finally begins.

## Fix

Edit `src/modules/generator-ui/lib/mergeVideos.ts`:

1. **Disable native loop**: set `soundtrackEl.loop = false`. We will handle looping manually so it always wraps to `winStart`, never to `0`.
2. **Re-seek immediately before `play()`**: set `soundtrackEl.currentTime = winStart` again right before `await soundtrackEl.play()` (in addition to the early seek), to defeat any browser-side reset and guarantee the first sample heard is exactly at `winStart`.
3. **Use a `requestAnimationFrame` clamp loop instead of `timeupdate`**: poll `currentTime` at frame rate and, the moment it crosses `winEnd`, snap back to `winStart`. This eliminates the up-to-250 ms overshoot. Also handle the `ended` event (fires at file end if `loop = false`) by snapping back to `winStart` and resuming `play()`.
4. **Stop the soundtrack precisely when video recording finishes**: cancel the rAF clamp loop and pause the audio in the existing teardown block (around lines 471–474) so no extra audio is captured after the last clip.
5. Keep the existing `audio.startSec / audio.endSec` plumbing from `DashboardPage.tsx` — that part is already correct (`musicRange[0]` / `musicRange[1]` are passed straight through).

No UI changes, no contract changes, no other files touched.

## Acceptance check

- Pick a soundtrack, drag the green selection to `0:05 – 0:20`, click Preview → the green selection plays (already works).
- Click Done, render the Final Film → playing the produced video, the audio heard begins exactly at the file's 0:05 mark and never plays content from before 0:05 or after 0:20. If the video is longer than the selection, the audio loops back to 0:05 (not to 0:00).

## Files to change

- `src/modules/generator-ui/lib/mergeVideos.ts` (soundtrack setup + tear-down block only)
