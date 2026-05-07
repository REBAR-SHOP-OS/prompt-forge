# Fix: Final Film merge progress stuck at 33%

## Root cause

In `src/modules/generator-ui/lib/mergeVideos.ts`, the per-clip loop has this sequence when a transition is configured between clip A and clip B:

```text
1. snapshot last frame of A
2. video.play()  ← B starts playing here
3. await transition paint loop (durationMs of the transition)
4. loopPaint(B)
5. video.addEventListener('ended', ...)  ← listener attached LATE
6. await ended
```

The `ended` listener is attached **after** the transition awaits. If clip B is short (or the transition is long, e.g. 1500ms on a 5s clip combined with already-elapsed playback), the `ended` event can fire **before** step 5, and the loop awaits forever — exactly what the user sees: progress freezes after the first transition.

With 3 clips of ~5s each, finishing the first clip reports ~33%; the second clip then plays through and ends silently while we're still in the transition await, so we never advance. That matches the "stuck at 33%" symptom.

The same race exists in the "cut" branch and the "first clip" branch (less likely to trigger, but still wrong).

## Fix

Edit `src/modules/generator-ui/lib/mergeVideos.ts`:

1. **Attach the `ended` listener BEFORE `play()`** in all three branches (first clip, cut transition, animated transition). Wrap in a single helper:
   ```ts
   function whenEnded(video: HTMLVideoElement): Promise<void> {
     return new Promise((resolve) => {
       if (video.ended) { resolve(); return }
       const onEnded = () => { video.removeEventListener('ended', onEnded); resolve() }
       video.addEventListener('ended', onEnded)
     })
   }
   ```
   Create the promise first, then `await video.play()`, then run the transition paint loop, then `await endedPromise`.

2. **Guard the transition paint loop** so it stops early if the video ends mid-transition (`video.ended` true): break out of the rAF loop and proceed.

3. **Safety timeout**: if `ended` doesn't fire within `(duration - currentTime + 500ms)` after play, resolve anyway and continue. Prevents indefinite hangs from any future regression.

4. **Defensive `play()` handling**: log and continue if `play()` rejects (autoplay policy / decode error) instead of silently leaving the video paused.

No other files change. The progress reporting itself is correct; the bug is that the loop never advances past clip 2.

## Verification

- 3-clip Final Film with a Fade transition between clip 1↔2 and 2↔3 should progress 0 → 33 → 66 → 100 → upload.
- Cut-only merges still work.
- Single-image still clips (already converted to short webm) finish via `ended` correctly.
