## Goal

In the Voiceover dialog, the voiceover settings/player panel (volume, waveform, "Play on video from … to") is currently hidden behind a gear (`Settings2`) toggle, so it can collapse into the empty state shown in image 2. The user wants the panel (image 1) to **always** show whenever an active voiceover exists, and the collapsed state + gear toggle to no longer exist.

## Changes — `src/modules/generator-ui/components/VoiceoverDialog.tsx`

1. **Always render the panel when a voiceover exists**: change the condition at line 396 from `activeVoiceoverUrl && showSettings ?` to just `activeVoiceoverUrl ?`.

2. **Remove the gear toggle button** from the `DialogFooter` (lines 499–510, the `activeVoiceoverUrl ? <Button …><Settings2/></Button> : null` block).

3. **Remove the now-unused `showSettings` state** (line 121) and the `setShowSettings(true)` call inside `handleUseAsSoundtrack` (line 249).

4. **Drop the now-unused `Settings2` import** from the lucide-react import (line 2).

## Result
- Whenever there is an active voiceover, the full player/settings panel is shown automatically (image 1).
- The collapsed view with the gear button (image 2) no longer exists.
- The footer keeps "Use as soundtrack" (music icon), Download, and Close.

No backend, data, or logic changes beyond removing the toggle.