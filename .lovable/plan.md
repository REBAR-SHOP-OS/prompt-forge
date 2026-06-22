# Narration choice for ad scenario

When the user clicks the "Generate ad scenario" icon/button, show two choices — **With narration** and **Without narration** — and write the scenario based on the chosen option.

## Behavior
- Clicking the generate button no longer fires generation immediately. Instead it opens a small popover menu with two items:
  - **With narration** → scenario includes the spoken narration line per scene (current behavior).
  - **Without narration** → scenario contains only the visual scenario (subject, action, camera, lighting), with no narration/spoken lines.
- The same two-option menu is used for the **Regenerate** button after a scenario already exists, so users can switch modes.
- The selected mode is passed to the backend so the AI either includes or omits narration.

## Frontend changes (`src/modules/generator-ui/components/ProductAdDialog.tsx`)
- Add a localized label set: `withNarration` / `withoutNarration` (en, fa, ar, tr, es, fr) in the translation tables.
- Change `generate()` to accept a `withNarration: boolean` argument and include `narration: withNarration` in the `scenario-write` invoke body.
- Wrap the main generate button (line ~1969) and the regenerate button (line ~1934) in a `Popover` (already imported). The trigger keeps the existing icon/label; the content lists two buttons that call `generate(true)` and `generate(false)` then close the popover.
- Keep all existing disabled/loading states.

## Backend changes (`supabase/functions/scenario-write/index.ts`)
- Read `narration` from the request body (default `true` for backward compatibility).
- Thread it into `buildSystemPrompt`.
- When `narration` is `true`: keep the current narration format block.
- When `narration` is `false`: omit the narration block and instead add an instruction to write the visual scenario only — no narration label, no voiceover, no spoken dialogue.
- Redeploy the `scenario-write` edge function.

## Technical notes
- `narration` is validated as a boolean; anything non-boolean falls back to `true`.
- No schema/storage changes. UI-and-prompt only.
