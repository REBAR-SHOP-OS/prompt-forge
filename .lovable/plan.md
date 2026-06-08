# Fix: Final Film quality drops on merge

## Root cause
When you press "Final Film", the project clips are concatenated in the browser by painting each clip onto a canvas and recording that canvas with `MediaRecorder` (`src/modules/generator-ui/lib/mergeVideos.ts`, line 735):

```ts
const recorder = new MediaRecorder(outStream, { mimeType: chosenMime })
```

No bitrate is specified, so the browser falls back to its default canvas-capture bitrate (~2.5 Mbps). For 1080p / vertical HD clips that is far too low, so the merged film looks softer/blockier than the original cards — exactly the "quality drops" you see. The drop is intermittent because it only becomes obvious on higher-resolution or more detailed scenes.

## The fix
Set an explicit, resolution-aware high bitrate on the recorder so the output preserves source quality.

### `src/modules/generator-ui/lib/mergeVideos.ts`
1. After the canvas `width`/`height` are known, compute a target video bitrate proportional to resolution and frame rate, e.g.:
   - `videoBitsPerSecond ≈ width * height * fps * 0.18`, clamped to a sensible range (about 8 Mbps min, 40 Mbps max). This yields roughly 12–16 Mbps for 1080p — visually lossless for this pipeline.
   - `audioBitsPerSecond` set to 192 kbps.
2. Pass these into the `MediaRecorder` constructor:
   ```ts
   const recorder = new MediaRecorder(outStream, {
     mimeType: chosenMime,
     videoBitsPerSecond,
     audioBitsPerSecond: 192_000,
   })
   ```
   Wrap in a try/catch that falls back to the bitrate-less constructor if a browser rejects the options, so nothing can break the merge.
3. (Quality safeguard) Ensure the merge canvas isn't downscaled below the source: the current `Math.max(640, …)` / `Math.max(360, …)` only raise tiny inputs and are fine, so the canvas already records at full source resolution — no change needed there beyond the bitrate.

## Notes on the MP4 export
The optional MP4 transcode (`transcodeToMp4.ts`) re-encodes with `-crf 23` and caps width at 1920px, which is already good quality and unaffected here. The visible quality loss originates at the recording step, which this change fixes.

## Result
The merged Final Film keeps the sharpness of the original clip cards instead of being re-recorded at a low default bitrate, permanently fixing the quality drop.
