# Make the soundtrack waveforms visible under the preview

## The problem

The waveform components are already wired in (music = green, voiceover = indigo), and `musicUrl`/`voiceoverUrl` are passed correctly to both the multi‑clip player (`SequentialClipPlayer`) and the single‑clip player (`VideoWithSoundtrack`). The waveforms simply never appear on screen.

Root cause is layout clipping, not data:

- The preview outer container uses `maxHeight: previewMaxHeightPx` together with `overflow-hidden`.
- The video frame inside it uses `height: ratioToHeight(...)`, which resolves to `min(previewMaxHeightPx, ...)`.
- So the video alone consumes the **entire** height budget. The footer text and the waveform block sit *below* the video and are pushed outside the container, where `overflow-hidden` cuts them off.

That is why in the screenshot even the footer caption ("Live preview includes your music & voiceover…") is not visible — everything under the video is being clipped.

## The fix

Reserve vertical space for the footer + waveforms so the video no longer eats the whole budget. The video's max height becomes `previewMaxHeightPx − reservedFooterHeight`, leaving room for the caption and the waveform rows inside the same container.

Concretely:

1. **`SequentialClipPlayer.tsx`**
   - Compute a reserved offset based on what's shown: footer caption (~64px) plus a row per present soundtrack (music and/or voiceover, ~52px each) when `musicUrl`/`voiceoverUrl` exist.
   - Pass an effective video max height (`maxHeightPx − reserved`) into the video frame so `ratioToHeight` is clamped against the reduced value instead of the full budget. Implement by giving the inner video `<div>` a `maxHeight` of the reduced px value (the `min()` in `ratioToHeight` already respects the smaller of the two).
   - Keep the outer container `maxHeight` at the full `previewMaxHeightPx` so the whole stack (video + footer + waveforms) fits without clipping.

2. **`DashboardPage.tsx` single‑clip path (`VideoWithSoundtrack`) and image path**
   - Apply the same reserved‑height adjustment for the single‑clip preview so its waveforms are visible too: reduce the `videoBoxStyle` height ceiling by the reserved footer/waveform height when `musicUrl`/`voiceoverUrl` are present.

3. No changes to audio sync logic, volumes, ranges, or Final Film generation — this is purely presentation (frontend layout).

## Verification

- Open a project that has music (and/or voiceover) with a multi‑clip film: confirm the green music waveform (and indigo voiceover waveform) now render directly under the video, with the playhead advancing in sync while playing.
- Open a single‑clip preview with music: confirm the waveform appears under it as well.
- Confirm a clip with no soundtrack shows no waveform area and the video still fills the available height.
- Confirm nothing below the video is clipped at the smallest and largest preview heights.

## Files
- `src/modules/generator-ui/components/SequentialClipPlayer.tsx`
- `src/modules/generator-ui/pages/DashboardPage.tsx`
