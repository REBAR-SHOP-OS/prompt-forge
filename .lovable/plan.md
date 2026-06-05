## Goal
Add a **target duration (seconds)** control to the Voiceover dialog so the generated voice is built to fit the number of seconds the user specifies (e.g. for matching a 5s / 10s / 30s clip).

## How duration will be enforced
Gemini TTS has no hard duration parameter, so we combine two layers:
1. **Pacing hint in the prompt** — tell the model to speak at a pace that fits the requested seconds (slower for long targets, faster/tighter for short ones).
2. **Exact snap via time-stretch (server-side, pitch-preserving)** — after the WAV is generated, measure its real duration and, if it differs from the target, time-stretch the PCM with an overlap-add (OLA) algorithm so the final file is (within a small tolerance) exactly the requested length. Stretching is clamped to a safe range (~0.6×–1.8×) to avoid robotic artifacts; if the text is far too long/short for the target, we stretch to the clamp limit and surface a gentle warning.

## Changes

### `src/modules/generator-ui/components/VoiceoverDialog.tsx`
- Add `durationSec` state (default `Auto` = no constraint).
- Add a control next to Gender/Tone: a **Duration** select with options `Auto, 5s, 10s, 15s, 30s, 45s` plus a custom number input (1–135s) for an exact value.
- Pass `durationSec` (omitted when Auto) in the `tts-generate` invoke body.
- If the response includes a `warning` (target not fully achievable), show it via `toast`.
- Reflect the chosen duration in the download / soundtrack file name.

### `supabase/functions/tts-generate/index.ts`
- Accept optional `durationSec` (validate 1–600; ignore if absent).
- When present, append a pacing instruction to `styledPrompt` (e.g. "Pace the delivery so the entire line lasts about N seconds.").
- After building PCM, compute current duration = `pcm length / (sampleRate * 2)`. If `durationSec` is set and the difference exceeds ~0.15s, run an OLA time-stretch on the 16-bit PCM to hit the target (clamped to 0.6×–1.8×). Add a `timeStretch` overlap-add helper alongside the existing `pcmToWav`.
- Return `targetDurationSec`, `actualDurationSec`, and an optional `warning` when the target was clamped.

## Result
The user can pick or type how many seconds the voiceover should last, and the generated audio is produced and trimmed/stretched to that exact length while keeping natural pitch — ideal for syncing voiceover to a specific clip duration. No database or auth changes needed.
