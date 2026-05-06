## Goal

In the "Soundtrack for Final Film" dialog, when the user clicks or drags the waveform's playback line (cursor) to a new position, music should immediately start playing from that point — not just move the cursor silently.

## Changes

**File:** `src/modules/generator-ui/components/SoundtrackWaveform.tsx`

1. Add a WaveSurfer `interaction` event handler (fires on user click/drag on the waveform timeline) that:
   - Clears `stopAtRef` (so the prior selection-stop boundary doesn't immediately pause).
   - Calls `ws.play()` to start playback from the clicked position.
2. Keep current `seeking` handler for updating `currentTime` UI.
3. The drag-to-resize on the green selection region should NOT trigger this — only clicks on the waveform body itself. WaveSurfer's `interaction` event fires only for waveform clicks (not region drags), so the behavior is naturally scoped.
4. Update the play/pause icon state correctly via existing `play`/`pause` events (already handled).

## Technical detail

```ts
const handleInteraction = () => {
  setCurrentTime(ws.getCurrentTime())
  stopAtRef.current = null
  void ws.play()
}
ws.on('interaction', handleInteraction)
// remove the duplicate ws.on('interaction', handleSeek)
```

## Outcome

Clicking or scrubbing the waveform line forward/backward instantly starts playing from that point. Selection region drag and the existing Play / Play selection buttons continue to work as before.
