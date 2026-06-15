## Plan: Remove prompt/status footer from single-clip preview

### What to build
Remove the prompt + status footer from the single-clip video preview in `DashboardPage.tsx`, matching the earlier removal done in `SequentialClipPlayer.tsx`.

### Why
The user previously asked that the preview should only show the video and the music/voiceover waveforms — the prompt text and status badge are unnecessary and take up vertical space that can clip the waveform.

### Changes
1. **`src/modules/generator-ui/pages/DashboardPage.tsx`** (lines ~7679–7706)
   - Delete the footer `<div>` containing:
     - `previewItem.job.input_prompt` text
     - Trim (scissors) button
     - Status dot + "Ready"/"Rendering" badge
   - Adjust the `maxHeight` reserved space for the video box (line ~7557) — remove the `64px` footer reservation so the video uses the recovered space.

2. Keep the `VideoWithSoundtrack` component and its waveform unchanged — only remove the outer footer.

### Verification
- Open a single completed clip with music — confirm no prompt/status bar shows under the video, waveforms render fully, and nothing is clipped.
- Confirm a clip with no soundtrack shows no footer and the video fills the frame.
- Check at small and large preview heights that the entire stack stays inside the viewport.