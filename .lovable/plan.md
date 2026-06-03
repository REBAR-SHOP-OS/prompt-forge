# Fix: Final Film quality drops sharply

## What's wrong

The Final Film is built in the browser by painting each clip onto a canvas and recording that canvas with `MediaRecorder` (`src/modules/generator-ui/lib/mergeVideos.ts`).

The recorder is created with **no bitrate set**:

```ts
const recorder = new MediaRecorder(outStream, { mimeType: chosenMime })
```

When `videoBitsPerSecond` is omitted, Chromium falls back to a low default (~2.5 Mbps) regardless of the output resolution. For a 1080p / 9:16 reel that is far too low, so the final video looks blocky and soft compared to the source clips — exactly the "quality dropped dramatically" the user is seeing. The individual clips look fine because they were encoded by the provider at a proper bitrate; only the re-recorded merge is starved.

A secondary, smaller factor: the canvas 2D context uses default image-smoothing, which can soften scaled frames.

## The fix

All changes stay inside `src/modules/generator-ui/lib/mergeVideos.ts` (presentation/encoding only — no backend or schema changes).

1. **Set a resolution-scaled video bitrate** on the `MediaRecorder`. Compute a target from the canvas pixel count so 720p, 1080p, and vertical reels each get an appropriate rate, and add a healthy audio bitrate. Roughly:
   - target ≈ `width * height * fps * bitsPerPixel` with a sensible factor (~0.1), clamped to a reasonable floor/ceiling (e.g. min 6 Mbps, max ~24 Mbps).
   - `audioBitsPerSecond`: 128 kbps.
   - Pass these in the `MediaRecorder` options, guarded so that if the chosen values aren't accepted the recorder still constructs.

2. **Improve canvas draw fidelity**: enable `ctx.imageSmoothingEnabled = true` and `ctx.imageSmoothingQuality = 'high'` on the main and snapshot contexts so down/upscaled frames stay crisp.

3. Keep everything else (WebM output, transition painting, audio routing, progress) unchanged.

## Technical detail

```text
pixels      = canvas.width * canvas.height
targetVideo = clamp(round(pixels * fps * 0.1), 6_000_000, 24_000_000)
recorder    = new MediaRecorder(outStream, {
                mimeType: chosenMime,
                videoBitsPerSecond: targetVideo,
                audioBitsPerSecond: 128_000,
              })
```

Wrapped in a try/catch that falls back to the current no-bitrate construction if the browser rejects the options.

## Verification

- Build a Final Film from the current 3-clip project and confirm the exported video is visibly sharp and close to the source clip quality.
- Confirm the merge still completes (progress reaches 100%, no hang) and the file still plays.
