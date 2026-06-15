## Goal
Add a **Child** voice option (alongside Female/Male) and **more tone themes** to the Voiceover dialog, wired end-to-end to the TTS edge function.

## Current state
- Gender = `female | male`; Tone has 6 values (advertising, excited, calm, narrative, friendly, serious).
- `VoiceoverDialog.tsx` defines these locally; the `tts-generate` edge function defines them again with a `VOICE_MAP[gender][tone]` (Gemini prebuilt voice names) and `STYLE_INSTRUCTION[tone]` prompts.
- Both sides must stay in sync (gender×tone matrix).

## Changes

### 1. Frontend — `src/modules/generator-ui/components/VoiceoverDialog.tsx`
- Extend `Gender` type → add `'child'`; add Select option **Child** under Gender.
- Extend `Tone` type and `TONE_LABELS` with new themes:
  - `dramatic` (Dramatic), `whisper` (Whisper / Soft), `news` (News Anchor), `storytelling` (Storytelling), `cheerful` (Cheerful), `sad` (Sad / Emotional), `angry` (Angry / Intense)
  - (kept alongside the existing 6)
- No other UI logic changes; the existing Select renders new options automatically.

### 2. Backend — `supabase/functions/tts-generate/index.ts`
- Add `'child'` to `Gender` type + `isGender` guard.
- Add new tones to `Tone` type + `isTone` guard + `STYLE_INSTRUCTION` (one natural-language style prompt per new tone).
- Extend `VOICE_MAP` to a full `gender × tone` matrix for all 3 genders and all tones.
  - Child has no dedicated Gemini prebuilt "kid" voice, so map child to the brightest/youngest-sounding prebuilt voices (e.g. `Leda`, `Kore`, `Autonoe`) **and** prepend a style instruction like *"in the bright, youthful voice of a young child"* so Gemini renders a child-like delivery. This is the safe, deterministic way to approximate a child voice with Gemini TTS.
- Keep defaults/validation; fall back to a safe voice if a combination is missing.

## Technical notes
- Gemini TTS (`gemini-2.5-flash-preview-tts`) only exposes a fixed set of prebuilt voices and no true "child" voice — child timbre is achieved via voice choice + style prompting, so results are an approximation, not a real child recording.
- Edge function will be redeployed after the edit so the new options work at runtime.
- No DB/schema/security changes.

## Files
- `src/modules/generator-ui/components/VoiceoverDialog.tsx`
- `supabase/functions/tts-generate/index.ts` (+ redeploy)