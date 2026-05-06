# Transitions between cards (final film)

Add a small **transition picker between every two adjacent cards** in the right-side history panel. The user chooses from a few sample transitions; when "Final film" is rendered, those transitions are applied between the corresponding clips.

## UX

Between each pair of adjacent cards in the history list, render a thin horizontal divider with a centered chip showing the current transition (e.g. `Cut`, `Fade`, `Crossfade`, `Slide ←`, `Slide →`, `Wipe`, `Zoom`). Clicking the chip opens a small popover/menu listing the samples; selecting one updates state.

Default for every gap = `Cut` (current behavior, no visual change to today's output).

```text
[ Card 1 ]
———— ⤳  Crossfade  ▾ ————
[ Card 2 ]
———— ⤳  Cut       ▾ ————
[ Card 3 ]
```

## Sample transitions (v1)

Lightweight, all renderable with the existing `<canvas>` + `MediaRecorder` pipeline (no FFmpeg needed):

1. **Cut** — instant switch (current default, 0 ms)
2. **Fade to black** — outgoing fades to black, incoming fades from black (~500 ms)
3. **Crossfade** — outgoing dissolves into incoming (~500 ms)
4. **Slide left** — incoming slides in from the right pushing outgoing out (~500 ms)
5. **Slide right** — mirror of slide left (~500 ms)
6. **Wipe** — incoming reveals via a moving vertical edge (~500 ms)
7. **Zoom** — outgoing scales up while fading; incoming scales in from 0.9× (~500 ms)

Duration is fixed at 500 ms in v1 (configurable later).

## Changes

### 1. State — `DashboardPage.tsx`
- Add `transitions: Record<string, TransitionId>` keyed by **the id of the card on the LEFT side of the gap** (i.e. the gap below card N is keyed by card N's id).
- Default = `'cut'`. Persist in component state only (not DB) for v1.
- New `TransitionId` type and `TRANSITION_OPTIONS` constant (id, label, durationMs).

### 2. UI — `DashboardPage.tsx` aside list
- In the `displayedVideos.map(...)` loop, after each card except the last one, render a `<div>` with a centered `<DropdownMenu>` (shadcn) trigger labeled with the current transition.
- `e.stopPropagation()` on the trigger so clicking it doesn't select the card for preview.
- Use `lucide-react` icon `Sparkles` (or `MoveHorizontal`) next to the label.

### 3. Pass transitions to merge — `DashboardPage.tsx` `handleMergeAllVideos`
- Build a `transitionsForMerge: TransitionSpec[]` array with one entry per gap, in the same order as `rawUrls` (length = `urls.length - 1`).
- Pass it as a new optional argument to `mergeVideoUrls`.

### 4. Apply transitions during render — `mergeVideos.ts`
- Extend `mergeVideoUrls` signature to accept `transitions?: TransitionSpec[]`.
- Refactor the per-clip loop:
  - Before the LAST 500 ms of the outgoing clip ends, start preloading & buffering the next clip.
  - When the outgoing clip emits the `ended` event, run a **transition phase**: a `requestAnimationFrame` loop for `durationMs` that paints a blended frame using both the previous clip's last frame (snapshot to an offscreen canvas) and the next clip's current frame — using the right blend mode for each transition type (`globalAlpha` for fade/crossfade, `drawImage` offsets for slide/wipe, `scale` transforms for zoom).
  - For `cut` (durationMs = 0), behavior is identical to today.
- Audio:
  - Soundtrack mode: unchanged (background music plays continuously through transitions).
  - Original-clip-audio mode: cleanly disconnect the outgoing clip's audio at the start of the transition and connect the incoming clip's audio (slight overlap is acceptable for crossfade; for fade-to-black we briefly silence by lowering a `GainNode`).

### 5. Files touched
- `src/modules/generator-ui/pages/DashboardPage.tsx` — new state, dropdowns between cards, pass transitions to merger
- `src/modules/generator-ui/lib/mergeVideos.ts` — new `TransitionSpec` type, transition rendering loop
- (no new dependencies)

## Out of scope (v1)
- Custom transition durations
- Persisting transition selections across reloads
- 3D / WebGL transitions (flip, cube, morph) — possible v2 with a shader pass
