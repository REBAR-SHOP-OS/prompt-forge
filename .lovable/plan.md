## Goal
In the "Soundtrack for Final Film" dialog, remove the **Music only** button and keep only the **Mix audio** option, displayed as a single large button.

## Changes (in `src/modules/generator-ui/pages/DashboardPage.tsx`, ~lines 6051–6120)

1. Remove the **Music only** `<button>` (the `setSoundtrackMode('music-only')` element with the `Music2` icon).
2. Make the **Mix audio** button span the full width as a single large button (keep the `SlidersHorizontal` icon + "Mix audio" label, larger padding).
3. Force the audio mode to always be `mix`: set `soundtrackMode` default to `'mix'` and remove the music-only branch, so the clip/music volume sliders are always shown.
4. Remove the now-unused music-only explanatory paragraph and, if no longer referenced, the `Music2` import.

## Result
The dialog shows one prominent "Mix audio" button with the Clip audio / Music volume sliders always visible; the music-only mode is gone.
