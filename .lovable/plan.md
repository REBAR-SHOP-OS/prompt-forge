## Goal

In the Soundtrack modal, replace the current implicit behavior with **two clear icon buttons**:

1. **Music Only** (🎵) — Plays only the soundtrack on the Final Film; the original clip audio is fully muted.
2. **Mix / Edit Audio** (🎚) — Opens volume controls so the user can independently adjust:
   - Clip audio volume (0–100%)
   - Music volume (0–100%)
   Both are then mixed together over the Final Film.

The chosen mode + volumes are applied during the merge.

## UI Changes — `DashboardPage.tsx` (Soundtrack Dialog, ~line 1734–1790)

Add a mode selector row above "Selection":

```text
[ 🎵 Music only ]   [ 🎚 Mix audio ]
```

- The two buttons are mutually exclusive (toggle group). Active one is highlighted (emerald, matching existing waveform accent).
- When **Mix** is selected, reveal two sliders below:
  - "Clip audio" slider (0–100, default 100)
  - "Music" slider (0–100, default 100)
- When **Music only** is selected, hide sliders. (Internally: clipVolume = 0, musicVolume = 1.)
- "Done" persists mode + volumes into state; "Remove" clears soundtrack as today.

New state in `DashboardPage`:
```ts
const [soundtrackMode, setSoundtrackMode] = useState<'music-only' | 'mix'>('music-only')
const [clipVolume, setClipVolume] = useState(1)   // 0..1
const [musicVolume, setMusicVolume] = useState(1) // 0..1
```

## Merge Pipeline — `mergeVideos.ts`

Extend `MergeAudioOptions`:
```ts
export interface MergeAudioOptions {
  src: string
  startSec: number
  endSec: number
  musicVolume?: number   // 0..1, default 1
  clipVolume?: number    // 0..1, default 0 (music-only legacy behavior)
}
```

Replace the current `useSoundtrack ? mute clips : capture clips` logic with a true mixer:

- Always create the `AudioContext` + `MediaStreamAudioDestinationNode`.
- For the **soundtrack** element: route through a `GainNode` set to `musicVolume`, then to destination.
- For each **clip video**: 
  - If `clipVolume > 0`, create `MediaElementAudioSourceNode` → `GainNode(clipVolume)` → destination, and set `video.muted = false`.
  - If `clipVolume === 0`, mute the element (current behavior) and skip routing.
- The existing soundtrack rAF clamp loop (winStart/winEnd) is preserved.

This lets both audio sources play simultaneously, each at user-defined volume.

## Call Site — `DashboardPage.tsx` (~line 1435)

```ts
const audioOpt = musicUrl && musicRange[1] > musicRange[0]
  ? {
      src: musicUrl,
      startSec: musicRange[0],
      endSec: musicRange[1],
      musicVolume,
      clipVolume: soundtrackMode === 'music-only' ? 0 : clipVolume,
    }
  : undefined
```

## Files Edited

- `src/modules/generator-ui/pages/DashboardPage.tsx` — add mode state, two icon buttons + sliders inside Soundtrack dialog, pass volumes to merge.
- `src/modules/generator-ui/lib/mergeVideos.ts` — extend `MergeAudioOptions` and add per-source `GainNode` mixing.

## Out of Scope

- Per-clip volume (only global clip volume).
- Live preview of the mix before generation (mix is rendered at merge time, like today).
- Fade-in/out envelopes on the soundtrack.
