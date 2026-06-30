# Write prompt: choose text, pick an ad tagline

Today the ✨ **Write prompt** button (`AiImageDialog.tsx` → `handleWritePrompt`) auto-decides whether to add on-image text (`includeAdCopy = Boolean(productRef)`) and immediately writes one prompt. The goal: when clicked, ask the user **with text / without text**; if they choose text, show several purely-promotional taglines based on the selected product, let them pick one, then bake that exact tagline into the written prompt so it renders on the image.

## New flow

```text
Click "Write prompt"
        │
        ▼
 ┌─────────────────────────────┐
 │ Popover: Add text on image? │
 │  • Without text             │──► write prompt normally (no on-image text)
 │  • With text                │
 └─────────────────────────────┘
        │ (with text)
        ▼
 Generate 4–5 advertising taglines (based on selected product/theme)
        │
        ▼
 Show taglines as selectable chips (+ "Regenerate")
        │ pick one
        ▼
 Write final prompt that composites that exact tagline → setPrompt(...)
```

## Frontend — `src/modules/generator-ui/components/AiImageDialog.tsx`

- Replace the single click handler with a small **Popover** anchored on the Write prompt button offering two choices: **Without text** and **With text**.
- **Without text**: call existing logic with `includeAdCopy: false` → sets the prompt (current behavior, minus auto ad copy).
- **With text**:
  1. Call `write-image-prompt` in a new `mode: 'taglines'` to fetch an array of short promotional taglines for the selected product (uses product reference image + name + theme).
  2. Render the returned taglines as selectable chips inside the popover, with a **Regenerate** button and a loading state.
  3. On selecting a tagline, call `write-image-prompt` again with `includeAdCopy: true` and the chosen `tagline`, then `setPrompt(written)` and close the popover.
- Add state: `promptTextMode` popover open flag, `taglines: string[]`, `isLoadingTaglines`, `selectedTagline`. Keep existing `isWritingPrompt` for the final compose step.
- English-only UI labels (per project convention). Disable "With text" path gracefully if no product is selected — fall back to theme/reference-based taglines.

## Backend — `supabase/functions/write-image-prompt/index.ts`

- Accept new optional fields: `mode` (`'prompt' | 'taglines'`, default `'prompt'`) and `tagline` (string).
- When `mode === 'taglines'`: prompt the model to return **only** a JSON array of 4–5 short taglines (max ~6 words each) that follow the existing STRICT advertising rules (no factual/performance claims, no guarantees/warranty wording). Parse and return `{ taglines: string[] }`.
- When `mode === 'prompt'` and a `tagline` is provided with `includeAdCopy`: instruct the model to composite that **exact** tagline text (in quotes) onto the image instead of inventing its own. Keep all current ad-copy safety rules.
- Preserve existing behavior when `mode`/`tagline` are absent.

## Notes
- No changes to auth, storage, credit logic, or the generation/merge pipeline.
- Reuses the existing `write-image-prompt` function and Lovable AI Gateway (no new secrets).
