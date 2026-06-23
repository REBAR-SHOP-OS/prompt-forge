# Theme/Style as Inspiration, Not Replication

## Goal
When a user picks a theme/style (e.g. Epic Fantasy, Sci‑Fi Minimalist, Cyberpunk Alleyway), the AI should treat it as **creative inspiration** and adapt it to the specific product/content — not literally recreate that world. Today the prompts instruct the model to apply the style "consistently across every shot," which pushes near‑exact copies of the reference style.

## Where the behavior is defined
The style wording is built into the AI system prompts in two edge functions:
- `supabase/functions/scenario-write/index.ts` → `cameraGuidance()` (genre + scene lines), used by Product Ad / Character Sheet scenario generation.
- `supabase/functions/enhance-prompt/index.ts` → `styleSuffix` block, used by the composer's Styles picker.

No UI changes and no changes to `promptStyles.ts` labels/previews are needed — only the instruction wording sent to the model.

## Changes

### 1. `scenario-write/index.ts` — `cameraGuidance()`
- **Genre line:** Rewrite so the style is a *mood/aesthetic inspiration* tuned to the product, not a literal world to reproduce. New wording (concept):
  > "Use this genre/atmosphere only as creative INSPIRATION: borrow its mood, energy, lighting feel, and color sensibility, then adapt and reinterpret it tastefully to fit THIS specific product/content and a believable advertising context. Do not literally recreate that genre's world or clichés — the {hero} and its real selling points stay the focus."
- **Scene line:** Similarly soften to "draw inspiration from this environment and adapt it to suit the product, rather than copying the location exactly," while keeping the {hero} the focus.

### 2. `enhance-prompt/index.ts` — `styleSuffix`
- Change "The rewritten prompt MUST incorporate and optimize for these style directions" to instruct the model to **take inspiration** from the chosen styles and adapt them to the user's subject/content, keeping the user's core idea, subject identity, and language intact — without forcing a literal style copy.

## Out of scope
- No changes to camera-style handling (camera moves should stay literal — a "tracking shot" must remain a tracking shot). Only genre/scene/visual-theme wording becomes inspiration-based.
- No DB, schema, UI, or preview-asset changes.

## Validation
- Deploy both edge functions.
- Generate a Product Ad scenario with a theme selected (e.g. Epic Fantasy on a cosmetic serum) and confirm the output adapts the mood to the product instead of producing a literal fantasy castle film. Repeat with a composer Styles selection.
