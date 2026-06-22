# Named character voices + instant sample preview

Add a "Character / Voice" picker to the Voiceover dialog that lists distinct, named voices (each with a personality description) grouped by gender, alongside the existing Gender and Tone controls. Each voice gets a ▶ button that instantly plays a short pre-made sample (no AI cost).

## What the user gets

- A new **Voice / Character** dropdown listing real named voices (e.g. Bright, Upbeat, Informative, Youthful, Firm, Breezy…), each with a one-line personality hint, organized under Female / Male / Child headers.
- A small **play** button next to each voice option (and next to the selected voice) that plays a ~3s sample clip instantly.
- Gender and Tone selectors stay. Picking a Gender filters the voice list; the chosen named voice drives the actual generation.

## Voice catalog

Define a shared catalog of Gemini prebuilt voices with: `id` (Gemini voiceName), `label`, `gender`, `personality` description, and `sampleUrl` (asset pointer). Examples per gender:

```text
Female: Leda (Youthful), Kore (Firm/Energetic), Aoede (Breezy/Calm),
        Callirrhoe (Easy-going), Autonoe (Bright), Despina (Smooth)
Male:   Puck (Upbeat), Charon (Informative), Fenrir (Excitable),
        Algieba (Smooth), Orus (Firm), Achird (Friendly)
Child:  Leda, Kore, Autonoe (bright youthful, child-style instruction)
```

## Pre-made sample assets

1. Generate one short sample clip (fixed phrase, ~3s) per distinct voice using the existing Gemini TTS path, one time, in build mode.
2. Upload each clip via `lovable-assets create` and commit the `.asset.json` pointers under `src/assets/voice-samples/`.
3. The catalog references these pointer URLs, so previews play instantly with zero credit cost.

## Frontend changes (`VoiceoverDialog.tsx`)

- Add `voiceId` state, defaulting to the first voice of the selected gender.
- Replace the plain Gender/Tone row layout to add a Voice picker. Filter catalog by `gender`; when gender changes, reset `voiceId` to that gender's default.
- Render each `SelectItem` with the voice label + personality + a small play button; also show a play button beside the trigger for the current selection.
- A single reusable `<audio>` element (ref) plays the selected sample; clicking play swaps `src` to the sample URL and plays. Stop any current playback first.
- Pass the explicit `voiceName: voiceId` in the `tts-generate` invoke body, and include the voice label in saved/handed-off names (e.g. `Voiceover (Leda · advertising).wav`).

## Backend change (`supabase/functions/tts-generate/index.ts`)

- Accept an optional `voiceName` string in the body. If it's one of the known catalog voice IDs, use it directly; otherwise fall back to the existing `VOICE_MAP[gender][tone]` lookup. Tone still controls the style instruction; child still adds the youthful hint. No breaking change to existing callers.
- Deploy and smoke-test with `supabase--curl_edge_functions`.

## Verification

- Build passes.
- In preview: open Voiceover, switch gender → voice list updates; click play on a few voices → sample audio plays instantly; generate a voiceover with a chosen named voice → audio uses that voice and the saved name reflects it.

## Notes / safety

- Sample assets are generated once and cached on the CDN — no per-preview AI cost, matching the cost-aware requirement.
- Backend change is additive (optional `voiceName`), so existing flows keep working.
