# Scenario Writer Icon (45s)

Add a new icon button — placed where the red circle is in the screenshot, just to the left of the model picker (`Google Veo 3 (Flow)`) — that:

1. Reads the currently uploaded **Start** image.
2. Asks the AI to write a **45-second cinematic scenario** based on that image.
3. Fills the prompt textarea with the result so the user can submit it.

## UX

- Icon: `Clapperboard` (lucide-react), label/tooltip: **"Scenario (45s)"** / `سناریوی ۴۵ ثانیه‌ای از تصویر استارت`.
- States:
  - Disabled (greyed) when there's no ready Start frame, or while another enhance/submit is in flight.
  - Spinner (`LoaderCircle`) inside the button while generating.
- On success → `setPromptText(scenario)` (replaces current prompt, same behavior as existing Enhance flow).
- On error → reuses `composerError` text below the textarea (same pattern as `runEnhancePrompt`).

## Where it goes (DashboardPage.tsx)

Insert a new `<button>` immediately before the model `<Popover>` at ~line 4410, matching the existing pill style (`h-10 rounded-full border border-[#2a2d32] bg-black/20 ...`) for visual consistency with the model button.

## Implementation

- New state: `isWritingScenario: boolean`.
- New handler `runScenarioFromStart()`:
  - Guard: requires `readyStartFrame?.url`; otherwise set `composerError` ("Add a Start image first.").
  - Calls existing `supabase.functions.invoke('enhance-prompt', { body })` with:
    ```ts
    {
      prompt: 'Write a 45-second cinematic scenario inspired by the attached Start image. Describe scene, atmosphere, camera moves, pacing, and a clear arc that fits ~45 seconds.',
      imageUrls: [readyStartFrame.url],
      mode: 'silent',
      narratorScript: '',
    }
    ```
  - Same 429 / 402 / generic error handling as `runEnhancePrompt`.
  - On success → `setPromptText(enhanced)`.

No backend / edge function changes — `enhance-prompt` already accepts `imageUrls` and returns `enhancedPrompt`.

## Out of scope

- No changes to job creation, models, Pending column, Live preview, or AI Image dialog.
- No new dependencies.

## Verification

1. Upload an image to **Start** → new clapperboard icon enables.
2. Click it → spinner shows, then the prompt textarea fills with a ~45s scenario based on the image.
3. Without a Start image → button is disabled and tooltip explains why.
4. Submit flow (arrow button) and the existing Prompt / Crop / Sparkles icons keep working unchanged.
