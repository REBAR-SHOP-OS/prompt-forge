## Goal

Make the `+` icon (top-right of the History panel) enforce **continuation**: every new card must continue the previous render. Concretely, clicking `+` should:

1. Find the most recent **completed** video (the latest non-deleted render).
2. Auto-extract that video's **last frame** as a PNG.
3. Upload it to the existing `wan-frames` storage bucket.
4. Pre-fill the composer in **Image to Video** mode with that frame as the **Start** image.
5. Leave the user only to add an **End** frame + prompt before clicking Render.

This makes every new clip a true continuation — the first frame of clip N+1 equals the last frame of clip N. Combined with the existing "merge all" feature, the final stitched video plays as one continuous shot.

## UX Behavior

- Clicking `+` clears the composer (as today) and immediately:
  - Switches mode to **Image to Video** (locks continuity).
  - Shows a `Uploading…` chip labeled `continuation-from-<jobId>.png` in the Start slot.
  - Once the frame is captured + uploaded, the chip flips to `Ready`.
- If there are **no prior completed videos**, `+` behaves exactly as before — empty composer, user picks Start/End manually.
- If frame capture fails (CORS on the video URL, decode error, etc.), show an inline error in the composer: "Continuation seed failed — upload a Start frame manually." The composer still works normally.
- Existing manual flow (user uploads Start/End themselves) is untouched.

## Technical Changes (single file)

### `src/modules/generator-ui/pages/DashboardPage.tsx`

1. **New helper `captureLastFrameAsBlob(videoUrl)`** — pure browser:
   - Creates a hidden `<video crossOrigin="anonymous" muted playsInline>`.
   - On `loadedmetadata`, seeks to `duration - 0.05`.
   - On `seeked`, draws to a `<canvas>` at the video's native dimensions.
   - Returns the canvas as a PNG `Blob` via `canvas.toBlob`.
   - Falls back to a brief `play()/pause()` cycle before seeking when the browser refuses an immediate seek on a remote stream.

2. **Convert `handleAddVideoCard` to async** and after the existing reset:
   - Look up the most recent completed visible job: `generatedVideos.find(v => !deletedIds.has(v.id) && normalizeStatus(v.status) === 'completed' && v.video?.storage_path)`.
   - If found and `userId` is present:
     - `setGenerationMode('image-to-video')`.
     - Insert a placeholder `UploadedFile` with `status: 'uploading'`, `target: 'Start'`.
     - Call `captureLastFrameAsBlob(prev.video.storage_path)`.
     - Upload the blob to the `wan-frames` bucket at `${userId}/start-${Date.now()}-${uuid}.png`.
     - Replace the placeholder with `{ status: 'ready', url: publicUrl, size: blob.size }`.
   - On any failure, drop the placeholder and set an inline `composerError` so the user can recover by uploading manually.

3. No changes to the orchestrator, edge functions, contracts, DB, or storage policies. The `wan-frames` bucket is already public and the existing user-scoped upload path already works for this user.

## What stays unchanged

- Edge functions, job orchestrator, DB schema, RLS, contracts.
- All other dashboard behavior: text-to-video mode, manual uploads, merge, delete, library, polling, progress bars.
- The `+` button still sits in the same spot in the right "Recent outputs" header.

## Acceptance

- After at least one completed render exists, clicking `+`:
  - Switches the composer into Image to Video mode.
  - Shows a Start chip that goes from `Uploading` → `Ready` within a couple of seconds.
  - The Start frame's image is the visually-identical last frame of the previously-played video.
- The Render button enables once an End frame and prompt are added — same as today.
- With zero prior completed videos, `+` opens an empty composer (no error).
- If frame capture fails, an inline error message explains and the user can still manually upload a Start frame.
