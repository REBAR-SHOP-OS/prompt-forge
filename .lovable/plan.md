# Fix: Final Film fails on uploaded image — "Clip #1 has no playable content (duration=0, 720x1280)"

## Root cause

In `src/modules/generator-ui/lib/imageToClip.ts`, image clips are converted to a WebM via `MediaRecorder` on a canvas stream. Browser-recorded WebMs from `canvas.captureStream()` are written without a duration in the EBML header, so when `loadVideo()` in `src/modules/generator-ui/lib/mergeVideos.ts` does:

```ts
const dur = Number.isFinite(v.duration) ? v.duration : 0
if (dur <= 0 || !v.videoWidth || !v.videoHeight) reject(...)
```

`v.duration` comes back as `Infinity`, gets clamped to `0`, and the clip is rejected. This is exactly the error in the screenshot, and it breaks Final Film whenever an uploaded image is among the clips.

The current approach is also wasteful: every image is encoded to WebM and uploaded to the `merged-videos` bucket on every Final Film run.

## Fix (principled, minimal, non-breaking)

Make the merger handle image clips natively, by painting the still image directly onto the shared canvas for its configured duration — bypassing MediaRecorder, the duration probe, and the storage upload entirely.

### 1. `src/modules/generator-ui/lib/mergeVideos.ts`
- Introduce a union input type so callers can pass either a video URL or an image clip:
  ```ts
  export type MergeClip =
    | { kind: 'video'; url: string }
    | { kind: 'image'; url: string; durationSec: number }
  ```
- Add an overload of `mergeVideoUrls` that accepts `MergeClip[]` (keep the existing `string[]` signature for back-compat — internally normalize strings to `{ kind: 'video', url }`).
- Add a small `loadImage(url)` helper that resolves to an `HTMLImageElement` and returns natural `width/height`.
- In the main loop:
  - For `kind: 'video'` → unchanged path (`loadVideo` + frame-accurate painter + `whenEnded`).
  - For `kind: 'image'` → skip `loadVideo` entirely. Paint the image with the existing `drawContain`-style logic onto the canvas, then drive a frame loop for exactly `durationSec * fps` frames using `requestAnimationFrame` (or `setTimeout(_, durationSec*1000)`) and resolve when done. No audio track is produced by the clip itself — music/voiceover mixing is unaffected.
- For target size detection (currently uses the first video's dimensions): if the first clip is an image and no video exists, fall back to the image's natural size, then to the aspect-ratio default already used by the caller.
- Transition handling stays identical — when transitioning from/into an image clip, the "outgoing snapshot" is the canvas (which already holds the painted image), and the "incoming" can be either a video element or an image painted into a temporary offscreen canvas. Keep the existing `paintTransitionFrame` signature by reusing the offscreen `snapshot` canvas for image-incoming frames.

### 2. `src/modules/generator-ui/pages/DashboardPage.tsx` — `handleMergeAllVideos` (around lines 3771–3791)
- Replace the `urls: string[]` + per-image `imageUrlToClip` + Supabase upload block with a `clips: MergeClip[]` build:
  ```ts
  const clips: MergeClip[] = []
  for (const clip of eligibleClips) {
    if (clip.kind === 'video') {
      clips.push({ kind: 'video', url: await proxiedVideoUrl(clip.job.video!.storage_path as string) })
    } else {
      const seconds = Math.max(1, Math.min(15, clip.image.still_duration_seconds || 3))
      clips.push({ kind: 'image', url: await proxiedVideoUrl(clip.image.storage_path), durationSec: seconds })
    }
  }
  ```
- Pass `clips` to `mergeVideoUrls(clips, ...)`.
- Remove the now-dead WebM upload to `MERGED_BUCKET` for stills. (Imports of `imageUrlToClip` can stay if used elsewhere — verify and remove only the unused references.)

### 3. Keep `imageUrlToClip` for now
It's also called in two other branches (lines ~2664 and ~2731) for appending a still to a single generated video. Those paths feed the same merger and have the same latent bug, but fixing Final Film is the user's reported issue. After the merger accepts `MergeClip[]`, those two callers can be migrated in a follow-up — out of scope here unless they break.

## Why this is the right fix

- Removes the broken round-trip (canvas → MediaRecorder WebM → upload → `<video>` probe) that was producing duration-less files.
- No backend / storage / RLS changes.
- Back-compat preserved: `mergeVideoUrls(string[], ...)` keeps working.
- Faster Final Film (no per-image encode + upload).
- Same visual output: the image is still painted on the same merge canvas, so transitions, aspect ratio, and recorded WebM/Opus output are unchanged.

## Verification

1. With the previous failing project (uploaded image as clip #1, then 3 generated videos), click Final Film → it should complete without the "duration=0" error.
2. Image-only Final Film (all clips are uploads) renders a valid WebM of total length = sum of `still_duration_seconds`.
3. Mixed image/video with each transition type (cut, fade, crossfade, slide, wipe, zoom) renders without freezing or black frames at the image→video boundaries.
4. Music + voiceover mixing still works (image clips contribute no audio, music/VO unchanged).
