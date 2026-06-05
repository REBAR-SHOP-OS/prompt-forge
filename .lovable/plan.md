## Goal
Fix the **Clip audio** slider so it correctly controls the clip's own audio volume in the live preview (both the Final Film sequential preview and the single-clip preview).

## Root cause
In both preview players the `clipVolume` is applied to the `<video>` element inside a `useEffect`, but the effect runs while the video element is still loading (not yet mounted), so `videoRef.current` is `null`. After the video finally mounts (when `usePlayableVideoUrl` resolves the URL), the effect does **not** re-run, so the freshly mounted `<video>` keeps its default `volume = 1`. Result: the clip always plays at full volume and the slider appears to have no effect.

- `SequentialClipPlayer.tsx` (line ~164): effect deps are `[current?.id, clipVolume]` — missing the resolved src / mount moment.
- `VideoWithSoundtrack.tsx` (clip volume effect): deps are `[clipVolume]` — same issue; also doesn't react to the resolved src.

## Changes

### 1. `src/modules/generator-ui/components/SequentialClipPlayer.tsx`
- Add `resolvedVideoSrc` (and `srcLoading`) to the clip-volume effect dependency array so volume is re-applied every time the video element mounts / its source resolves.
- Add an `onLoadedMetadata` (or `onLoadedData`) handler on the `<video>` that sets `el.volume`/`el.muted` from the current `clipVolume`, guaranteeing the value is applied as soon as the media element is ready.

### 2. `src/modules/generator-ui/components/VideoWithSoundtrack.tsx`
- Make the clip-volume effect also depend on the resolved playable src so it re-applies when the `<video>` mounts after loading.
- Add the same `onLoadedMetadata` handler on its `<video>` to apply `clipVolume` on mount.

## Result
The Clip audio slider immediately and reliably controls the clip's own audio in the preview, including right after a clip loads — matching the Music slider behavior. No backend or render-pipeline changes needed.
