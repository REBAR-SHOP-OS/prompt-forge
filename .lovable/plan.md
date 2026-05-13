# Show total film duration

The bottom overlay of `SequentialClipPlayer` currently shows only `1 / 3` and a `Live preview` badge. Add a clock icon + total film time next to them, so the user can see how long the merged film is.

## Changes

### `src/modules/generator-ui/components/SequentialClipPlayer.tsx`

1. Import `Clock` from `lucide-react`.
2. Add a `useTotalDuration(clips)` hook inside the component:
   - For each `image` clip: add `durationSec`.
   - For each `video` clip: probe duration once by creating a detached `HTMLVideoElement`, set `preload = 'metadata'`, listen for `loadedmetadata`, and cache the result in a `Map<src, number>` ref so we don't re-probe on re-renders or index changes.
   - Re-run when the list of clip ids/srcs changes.
   - Returns `totalSeconds` (number) — `0` while still probing.
3. Add a `formatDuration(sec)` helper: `mm:ss` (e.g. `0:18`, `1:24`).
4. In the bottom overlay (around line 281–288), insert a new pill **before** the `1 / N` pill:
   ```
   <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-0.5 tabular-nums">
     <Clock className="h-3 w-3" aria-hidden="true" />
     {formatDuration(totalSeconds)}
   </span>
   ```
   Title attribute: `Total film duration`.
5. While `totalSeconds === 0` (still probing), render `--:--` instead of `0:00` to avoid flicker.

No backend, no business-logic changes. Final Film generation is untouched.

## Verification

- Open Final Film preview with mixed image + video clips → pill shows the sum of all clip durations (e.g. `0:24`).
- Single-clip preview path (`VideoWithSoundtrack`) is **out of scope** — request specifically targets the modal in the screenshot. If the user wants it there too, add it in a follow-up.
- Switching clips via prev/next does not change the total.
- Adding/removing a clip updates the total.
