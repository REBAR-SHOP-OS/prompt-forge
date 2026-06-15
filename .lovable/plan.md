## Problem

In the sequential preview player, clicking the play/pause icon resets the video to the beginning instead of stopping at the current frame.

## Cause

In `src/modules/generator-ui/components/SequentialClipPlayer.tsx`, one effect (lines ~280-294) handles both seeking and play/pause, and it depends on `isPlaying`. Every time the user toggles play/pause, the effect runs and executes:

```text
const startLocal = pendingLocalRef.current || 0   // 0 when no pending seek
v.currentTime = startLocal                         // jumps video back to 0
```

So a simple pause (or resume) snaps the playhead to the start.

## Fix

Split the single effect into two concerns so a play/pause toggle never rewrites `currentTime`:

1. **Seek/load effect** — runs only when the active clip or its resolved source changes (deps: `current?.id`, `current?.kind`, `resolvedVideoSrc`). This applies the pending local seek position (`pendingLocalRef`) and starts playback if `isPlaying`.
2. **Play/pause effect** — runs only when `isPlaying` changes (deps: `isPlaying`). It calls `v.play()` or `v.pause()` and does NOT touch `currentTime`, so the video stops exactly where it is.

The soundtrack sync effect stays as-is. After the change, clicking the icon pauses at the current position and resuming continues from the same spot.

## Verification

- Play the sequential preview, click pause mid-clip → video freezes at the current frame, time stays the same.
- Click play again → playback resumes from that frame, music/voiceover stay in sync.
- Scrubbing and clip-to-clip transitions still seek correctly.
