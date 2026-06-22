## Goal
When a character + product are selected and a scenario is written, the generated **first-frame image** must ALWAYS be produced without any added text (no captions, titles, watermarks, slogans, or typography burned into the image). This must be an enforced requirement, not optional.

## Root cause
In `src/modules/generator-ui/components/ProductAdDialog.tsx`, the function `buildFirstFrame()` (lines ~1126–1144) composes the character + product opening frame by calling the `ai-image-edit` edge function with `composePrompt`. That prompt currently only describes the composition — it never instructs the model to avoid rendering text, so the model sometimes adds captions/labels/slogans to the frame.

## Change (single, minimal, frontend-only)
Update `composePrompt` in `buildFirstFrame()` to append a strict no-text instruction. The product's own real physical label/branding (which is part of the product itself) stays intact; only *added* text/graphics are forbidden.

New appended sentence (added to the existing prompt string):

```text
The final image MUST NOT contain any added text, captions, titles, subtitles,
slogans, typography, watermarks, logos, or UI overlays of any kind. Output a
clean photographic frame only. The only writing allowed is the product's own
real label that physically exists on the product in image 1.
```

```text
buildFirstFrame()
  └─ product + character branch
        composePrompt = [existing composition instructions]
                      + [new strict "no added text" clause]   ← added
        → supabase.functions.invoke('ai-image-edit', { prompt: composePrompt, imageUrls })
```

## Why this is safe
- Touches only one string literal in one function; no business logic, schema, or edge-function changes.
- Does not affect the product-only or character-only branches (those reuse existing signed images, no generation involved). If desired, this can later be extended, but the user's case (character + product + scenario) is the compose branch, which is the only one that generates a new image.
- No impact on the `jobs-create` / wan-frames validation flow.

## Validation
- Read back the edited lines to confirm the clause is present.
- Build passes automatically.
- Manual check in preview: select a character + product, write a scenario, use as first frame → generated opening frame has no overlaid text.
