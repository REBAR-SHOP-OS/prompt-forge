## Goal
Move the **Camera style** feature into the existing **Prompt** button's popover (the circled "Prompt" enhance menu), and change its behavior so it only **adds a cinematography/camera-movement style to the user's own prompt** — keeping the user's original prompt intact and just enriching it so the video looks more cinematic. The standalone Camera icon in the toolbar row is removed.

## UI changes — `src/modules/generator-ui/pages/DashboardPage.tsx`
- Remove the standalone Camera `Popover`/icon button currently in the toolbar row (lines ~7275–7319).
- Inside the existing **Prompt** popover (the one with "No narrator" / "With narrator", lines ~7500–7573), add a third option: **Camera style**.
  - It shows a small grid/list of the 10 styles (Whip Pan, Orbit Shot, FPV Drone, Tracking Shot, Push In Cinematic, Fly Through, Crash Zoom, Handheld Dynamic, Dolly Zoom, Parallax Motion) as selectable chips, similar to how "With narrator" reveals a sub-panel.
  - Selecting a style calls `runCameraStyle(style)`, shows the spinner, and closes the popover on success.
  - The Camera style option is disabled when the prompt is empty (since it only augments an existing prompt).

## Behavior change — `runCameraStyle` (lines ~2100–2137)
- Keep the same `enhance-prompt` invocation with `mode: 'camera'` and `cameraStyle`.
- Behavior intent stays "augment, don't rewrite" — the returned prompt = the user's original prompt with the camera style woven in.

## Backend change — `supabase/functions/enhance-prompt/index.ts`
- Rewrite `cameraSuffix()` so the model is instructed to:
  - **Preserve the user's original prompt content, subject, scene, and wording as much as possible.**
  - Only **add/integrate the chosen camera movement** (and minimal supporting cinematic phrasing) so the shot feels more attractive — not invent a new scenario.
  - **Keep the user's original language** (do not force-translate to English), so the addition matches the prompt's language.
- Keep validation (`mode === 'camera'` requires a valid `cameraStyle`) and the camera-style definitions as-is.
- Since camera mode now requires an existing prompt, the "seed from style alone" fallback for empty prompts is no longer needed (the UI blocks empty-prompt usage).
- Redeploy the edge function.

## Verification
- Build passes.
- Open the composer, type a prompt, click **Prompt**, choose **Camera style → e.g. Orbit Shot**, and confirm the prompt field updates with the same idea plus the camera movement, in the original language.
- Confirm the old standalone camera icon is gone from the toolbar.
