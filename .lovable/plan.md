## Problem

In the **Soundtrack for Final Film** dialog, the controls under the waveform (the round play/pause button and the green "Play selection" pill) appear as empty/blank shapes — the icon and text inside are invisible. This is what's circled in the screenshot.

## Root cause

`src/modules/generator-ui/components/SoundtrackWaveform.tsx` was styled assuming a dark surface, but the dialog actually has a **light/white** background. The button classes use light-on-light colors that disappear on white:

- Round play/pause button: `bg-white/10`, `text-zinc-50`, `border-white/25` → white icon on white background.
- "Play selection" pill: `text-emerald-100` on `bg-emerald-500/15` → very pale text on a pale green wash.
- Time display: `text-zinc-200`. Helper text: `text-zinc-400` — both too light for a white dialog.

## Fix

Edit only `src/modules/generator-ui/components/SoundtrackWaveform.tsx` (the toolbar block under the waveform, ~lines 203–234). Replace the dark-surface classes with light-surface equivalents that have proper contrast on the white dialog:

- Round play/pause button → `border-zinc-300 bg-white text-zinc-800` (hover: `border-zinc-400 bg-zinc-50`). The play/pause Lucide icon will now render dark on white.
- "Play selection" pill → keep the green theme but make the text legible: `border-emerald-600/40 bg-emerald-500/15 text-emerald-700` (hover: `border-emerald-600/60 bg-emerald-500/25`).
- Time readout `0:00 / 0:00` → `text-zinc-600`.
- Helper paragraph "Drag the edges…" → `text-zinc-500`.

No changes to layout, sizes, behavior, or any other file. The waveform itself and the rest of the dialog stay exactly as they are.

## Acceptance check

Open the Soundtrack dialog: the round play button shows a clearly visible play/pause icon, the green "Play selection" pill shows readable green text with the play icon, and the timer / helper text are easily readable on the white dialog background.
