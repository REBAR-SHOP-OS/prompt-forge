# Fix freezes in trimmed video output

## Why it still freezes

In `src/modules/generator-ui/lib/trimVideo.ts` the recorder runs continuously while we seek between keep‑segments. Two things end up baked into the file:

1. **Startup freeze** — `recorder.start(250)` runs before the first `seekTo(seg.start)` resolves and before `video.play()` resolves. The canvas is still showing the initial black/first frame for hundreds of ms while the recorder is already capturing 30 fps of that static frame.
2. **Inter‑segment freeze** — between segments we `video.pause()` → `seekTo(next.start)` → `drawContain` → `video.play()`. During the seek (often 100–400 ms in Chrome on long mp4s) the recorder keeps writing the same canvas frame, and the audio graph is connected so the small audio glitch is also encoded. Every cut produces a visible "frozen chunk".

So the architecture is correct (single recorder, no pause/resume), but we are still feeding it dead time.

## Fix

Switch to a **frame‑gated** capture so the recorder only sees frames while the video is actually playing, and mute the audio graph during seeks.

### Video gating
- Create the canvas stream with `canvas.captureStream(0)` (manual frame mode).
- Grab the single `CanvasCaptureMediaStreamTrack` and call `track.requestFrame()` from the rAF tick — but only inside the playing loop, after `drawContain`.
- Do not request any frames during seeks or between segments. Result: the encoder simply has no input during dead time, so the output has no frozen frames (and the timeline stays continuous because MediaRecorder timestamps by wall‑clock, but since no frames are pushed, the previous frame is not duplicated).

### Audio gating
- Insert a `GainNode` between `MediaElementSource` and `MediaStreamAudioDestinationNode`.
- Set `gain.value = 0` while seeking / between segments, set to `1` immediately before `video.play()` resolves for a segment. Use `setTargetAtTime` with a 5 ms time‑constant to avoid clicks.
- Keeps audio perfectly silent during glue moments instead of leaking the paused element's last sample.

### Recorder start timing
- Move `recorder.start(250)` to **after** the first `seekTo(segments[0].start)` and just before the first `video.play()`. That removes the startup freeze entirely.
- Keep `recorder.start(250)` (timeslice) so we still get incremental `dataavailable` chunks.

### Small correctness items
- When `cuts` is empty, keep the current single‑segment fast path but still go through the same gated start so behavior is uniform.
- `keptSoFar` progress stays as is.
- Clean up the `GainNode` and the captured track in `cleanup()`.

## Files to change
- `src/modules/generator-ui/lib/trimVideo.ts` — only this file. No UI or backend changes.

## Validation
- Build passes.
- Manual: open Trim clip dialog, mark 2–3 cuts in different positions, Apply changes, play the resulting clip — no freeze at the start, no freeze at each former cut boundary, audio stays in sync.
