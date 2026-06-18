# Download with format choice (WAV / MP4)

## Goal
Keep only a single **Download** control in the Voiceover dialog footer. When the user clicks it, show a small menu with two options so they can pick the export format:
- **Download as WAV**
- **Download as MP4**

## UI changes (`src/modules/generator-ui/components/VoiceoverDialog.tsx`)
- Replace the current `Download` button in `DialogFooter` with a `DropdownMenu`:
  - Trigger: the same `Download` icon button (disabled when `!audioUrl`).
  - Menu items: "Download as WAV" and "Download as MP4".
- The existing "Use as soundtrack" and "Close" buttons stay unchanged.

## Export logic
- **WAV**: download the existing generated audio blob directly (current `handleDownload` behaviour), filename `voiceover-<gender>-<tone>-<timestamp>.wav`.
- **MP4**: the voiceover is audio-only, so produce an audio MP4 (AAC in an `.mp4` container). Convert the generated audio blob to MP4 in the browser using `@ffmpeg/ffmpeg` (ffmpeg.wasm), then trigger the download with filename `voiceover-<gender>-<tone>-<timestamp>.mp4`. Show a brief "Preparing MP4…" toast while encoding, and an error toast on failure.

## Technical notes
- Add dependency `@ffmpeg/ffmpeg` + `@ffmpeg/util` for the in-browser conversion (lazy-loaded only when MP4 is selected, so it doesn't slow the dialog otherwise).
- No backend or business-logic changes; this is purely a frontend/presentation change in the dialog.

```text
[ Use as soundtrack ]   [ ⤓ Download ▾ ]   [ Close ]
                              │
                              ├─ Download as WAV
                              └─ Download as MP4
```
