# Show the full preview and drop the prompt caption

## Goals (from the user)
- The whole preview must be fully visible — nothing cut off at the bottom.
- The prompt/scenario text under the video is not needed.
- Only the music / voiceover waveforms should appear under the video.

## What's happening now
In `SequentialClipPlayer.tsx` the footer below the video renders:
1. The clip's prompt text (`current.label`) — a multi-line paragraph.
2. A small "Live preview includes your music & voiceover…" caption.
3. The `PreviewSoundtrackWaveforms` block.

The video frame still takes most of the height budget, so the prompt paragraph + caption push the waveforms past the container's `maxHeight` (which has `overflow-hidden`), and they get clipped — matching the screenshot where the waveforms are not visible.

## The fix
1. **Remove the prompt caption block** in `SequentialClipPlayer.tsx` (the `<div>` containing `current.label` and the helper caption). The footer becomes just the synced waveforms.
2. **Recompute the reserved vertical space** so the video frame leaves exactly enough room for the waveform rows (no longer reserving ~64px for the now-removed caption). Reserve only per-present-soundtrack rows plus the waveform block's own padding/border, so music and/or voiceover are always fully visible under the video.
3. Keep the existing audio-sync behavior, volumes, ranges, and Final Film generation unchanged — presentation only.

## Verification
- Open a multi-clip film with music (and/or voiceover): confirm no prompt text shows under the video, the waveform(s) render fully, and nothing is clipped.
- Confirm a clip with no soundtrack shows no footer and the video fills the frame.
- Check at small and large preview heights that the entire stack (video + waveforms + bottom controls) stays inside the viewport.

## Files
- `src/modules/generator-ui/components/SequentialClipPlayer.tsx`
