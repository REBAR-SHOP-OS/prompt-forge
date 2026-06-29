# Fix: Music & narration lost when reverting Final Film → Draft

## Problem
When a finalized "Final Film" is reopened as a Draft (pencil icon → `reopenFinalAsDraft`), the music and voiceover (narration) disappear from the draft. The soundtrack chips under the preview come up empty (circled area in the screenshots), and the audio is not restored when the draft is reopened later.

## Root cause
`reopenFinalAsDraft` in `src/modules/generator-ui/pages/DashboardPage.tsx` mutates `projectAudio` **twice**, and the two updates conflict:

1. Step "3. Remove the final film" (lines ~5877–5882) runs a functional `setProjectAudio` that **deletes** `finalId` from `projectAudio` and persists.
2. Step "8b. Move the film's persisted audio" (lines ~5979–5986) runs a second functional `setProjectAudio` that tries to move `projectAudio[finalId]` → `draftId`. But because React applies functional updaters in order, by the time this one runs `prev[finalId]` is already gone, so it returns unchanged and **never writes `projectAudio[draftId]`**.

Result: the durable audio mapping for the new draft is never persisted. The in-memory `restoreDraftAudio(draftId, movedAudio)` call may briefly set live state, but nothing is saved, so on any refresh / draft switch / snapshot pass the music and narration are lost. If the captured `movedAudio` is also empty, the chips are empty immediately.

## Fix (safe, minimal, non-destructive)
All changes are confined to `reopenFinalAsDraft` and `restoreDraftAudio` in `DashboardPage.tsx` — no schema, storage, or backend changes.

1. **Single atomic audio move.** Remove the standalone delete block (the `setProjectAudio` at ~5877–5882). Keep only the step-8b update, and rewrite it to perform the delete-and-move in one functional updater:
   - read `prev[finalId]`
   - if present, build `next` = `{ ...prev without finalId, [draftId]: audio }`
   - persist and return `next`
   This guarantees `projectAudio[draftId]` is written and survives refresh.

2. **Robust `movedAudio` capture.** Keep capturing `movedAudio = projectAudio[finalId]` from the render closure before the state update (already correct) and pass it to `restoreDraftAudio(draftId, movedAudio)` so live chips appear instantly in the same tick.

3. **Harden `restoreDraftAudio`.** When restoring, if `mergedDurationSec` is 0/unknown at that moment, fall back to the loaded audio track duration for the music/voiceover range and timeline so the chip and playback window are valid even before the preview has measured the film length. Always write the snapshot back into `projectAudio[draftId]` (durable) in addition to `draftAudioSnapshotRef`.

4. **Verification.** Typecheck clean (`tsgo`/build runs automatically). Manual check via preview: finalize a film with music + narration, click the edit/revert icon to send it back to Drafts, confirm the music and voiceover chips reappear under the preview, then refresh and reopen the draft to confirm they persist.

## Notes / out of scope
- Films finalized in an older version that never snapshotted audio at finalization will have no stored audio to restore; this fix cannot recover audio that was never saved. It guarantees correct behavior for all films finalized with the current audio-snapshot path.
- No changes to generation UI layout, auth, storage policies, or backend functions.
