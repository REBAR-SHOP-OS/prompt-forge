## Goal
Add a **Camera Style** picker (icon button) to the prompt composer toolbar. When the user picks a style, the current prompt is rewritten in English to incorporate that camera movement, making the scenario richer. Output is always English.

## Camera styles
Whip Pan · Orbit Shot · FPV Drone · Tracking Shot · Push In Cinematic · Fly Through · Crash Zoom · Handheld Dynamic · Dolly Zoom · Parallax Motion

## UI changes — `src/modules/generator-ui/pages/DashboardPage.tsx`
- Add a new round icon button (a camera/video icon, e.g. `Video` or `Camera` from lucide) in the toolbar row alongside the existing Reframe / AI-image / Scenario / Product-ad buttons (around lines 7176–7213).
- Wrap it in a Popover (project already uses shadcn popover) listing the 10 camera styles as selectable items. Tooltip/title: "Camera style".
- Selecting a style triggers a rewrite of the prompt (shows the same spinner state as enhance, disables while running) and closes the popover.

## Rewrite logic — `runCameraStyle(style)` helper in DashboardPage
- Reuse the existing `enhance-prompt` flow pattern (`runEnhancePrompt`). Add a new function that invokes the `enhance-prompt` edge function with a new `mode: 'camera'` and a `cameraStyle` field, passing the current prompt + any start/end frame image URLs.
- On success, set `promptText` to the returned (English) rewritten prompt.
- Handle 429 / 402 / generic errors via `setComposerError`, same as enhance.
- If prompt is empty, still allow generating a camera-driven scene description from the chosen style alone (seed prompt from the style).

## Backend — `supabase/functions/enhance-prompt/index.ts`
- Accept `mode: 'camera'` and a `cameraStyle` string (validate against the allowed list).
- Add a camera-style system suffix instructing the model to:
  - Rewrite/expand the prompt as a single cinematic video prompt built around the chosen camera movement (define each style, e.g. "Whip Pan = fast rotational blur transition", "Dolly Zoom = vertigo effect", etc.).
  - **Always output in English**, regardless of the input language (overrides the default "preserve original language" rule for this mode).
  - Keep it concise and cinematic, include subject/action/lighting/mood, and weave the camera motion naturally.

## Verification
- Build passes; open composer, click the new Camera style icon, pick a style, confirm the prompt field updates with an English, camera-aware rewrite. Test with an empty prompt and with an existing Persian prompt (should come back in English).
