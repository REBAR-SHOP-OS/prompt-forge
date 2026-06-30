# Add "Use film's first frame" button to the cover dialog

## Goal
In the **Generate image with AI** dialog (used to make a film cover), add a new icon button next to *Upload image / Pick a theme / Select product / Write prompt*. Clicking it grabs the **first frame of the current project's film** and adds it as a reference image, so the user can build a cover from the actual opening shot of the film.

## How it works
The film's opening shot is the first clip already shown in the right panel (`displayedVideos[0]`). We extract its frame at `t=0`, client-side, and inject it as a reference image into the dialog — exactly like "Select product" does, but sourced from the film.

```text
[Pending column film] --> first clip video URL
        |
        v
DashboardPage passes filmFrameSourceUrl prop to AiImageDialog
        |
        v
New "Film frame" button -> hidden <video> seeks to 0 -> canvas.drawImage
        |
        v
canvas.toDataURL() -> added to referenceImages[]  (same path as products)
```

## Changes

### 1. `DashboardPage.tsx`
- Compute a memo `coverFilmFrameUrl`: the playable/signed URL of the first available film clip for the current cover scope — `displayedVideos.find(v => v.video?.storage_path)?.video?.storage_path`, signed via the existing video-proxy resolver (`proxiedVideoUrl`). Null when no clip exists.
- Pass it to `<AiImageDialog filmFrameSourceUrl={coverFilmFrameUrl} />`.

### 2. `AiImageDialog.tsx`
- Add optional prop `filmFrameSourceUrl?: string | null`.
- Add a new pill button (icon: `Film` or `Clapperboard` from lucide-react) labeled **"Use film frame"**, placed in the same button row, disabled when there's no `filmFrameSourceUrl` or the reference slots are full.
- Handler `handleUseFilmFrame()`:
  - Resolve the URL through the existing proxy path (`proxiedVideoUrl`) so the `<video>` is same-origin and the canvas is **not tainted** (required for `toDataURL`).
  - Create an offscreen `<video>` (`crossOrigin="anonymous"`, `muted`, `playsInline`, `preload="auto"`), load the URL, wait for `loadeddata`, set `currentTime = 0`, wait for `seeked`.
  - Draw the frame to a canvas at the video's natural size, `toDataURL('image/png')`, and add it to `referenceImages` as `{ name: 'Film first frame', dataUrl }` (reuse the existing MAX_REFERENCE_IMAGES guard).
  - Surface friendly errors via the existing `setError` (e.g. "Couldn't read the film frame").

## Notes / safety
- No backend, schema, auth, or storage-policy changes.
- Frame extraction is purely client-side and reuses the existing `video-proxy` mechanism already trusted elsewhere, so no new CORS surface.
- The button no-ops gracefully (disabled) when the project has no film clips yet.
- Cover-saving flow is unchanged — the new button only seeds a reference image; the user still presses Generate.
