## Goal

When the user clicks **Use this image** in the AI image dialog, the generated image must be placed as the **Start** frame of the composer (in addition to being saved to the library), so the user can immediately use it for image-to-video.

## Current behavior

`AiImageDialog.onSaved` (DashboardPage.tsx:2588) only prepends the new row to `userImages` (the library list). The Start slot stays empty, so the user has to manually pick the image again from the library.

## Change

Update only the `onSaved` handler passed to `<AiImageDialog>` in `DashboardPage.tsx` (line 2583–2589). After updating the library:

1. Switch the composer to image-to-video mode (`setGenerationMode('image-to-video')`).
2. Append a new entry to `uploadedFiles` with:
   - `target: 'Start'`
   - `status: 'ready'`
   - `url: row.storage_path` (already a public URL, same pattern used by `handleReframeAsStart` at line 1431)
   - `name: \`ai-${row.id.slice(0,6)}.png\``, `type: 'image/png'`, `size: 0`
3. Set `setUploadTarget('Start')` for consistency.
4. Clear any prior Start placeholder if needed (optional — current pattern in `handleReframeAsStart` simply appends; we'll mirror that).

No backend, dialog, or library-list logic changes. The dialog still closes itself via its existing `onOpenChange(false)` after save.

## Verification

- Open AI image dialog → Generate → Use this image → dialog closes, Start chip shows the new image as ready, mode is image-to-video, Prompt → render works using that Start frame.
- Library panel still shows the new image at the top.
