## Goal

When a character is added to the **Product Ad Scenario**, the generated scenario must make that character **speak** — delivering spoken narration/dialogue that promotes and sells the product. Today the character is only described visually; it never talks.

## Where it changes

All changes are in the system prompt of `supabase/functions/scenario-write/index.ts` (the `buildSystemPrompt` function). No UI changes needed — the character is already attached and sent to the backend.

## What to change

1. **Character-with-product prompt block** (`productLine`, the branch where `productAd.characterImageUrl` exists):
   - Add instructions that the character is the **on-screen spokesperson/presenter** who speaks directly about the product.
   - Require the scenario to include the character's **spoken lines (narration/dialogue)** that pitch the product's benefits and end with a persuasive call-to-action, while keeping the product the hero.
   - Lines should be natural, short, and timed to the duration.

2. **Output format instructions** (both the multi-scene branch `sceneCount > 1` and the single-scene branch):
   - Only when a character is attached in product-ad mode, instruct the model to weave the character's spoken dialogue into each scene/the prose, formatted clearly (e.g. inline as `Character says: "..."`) so it reads as narration alongside the visual/camera description.
   - Keep the existing word caps and scene-delimiter rules intact; the spoken lines count toward the scene text.

3. Guard so this narration requirement applies **only** when a character is present (product-ad + `characterImageUrl`), leaving plain product ads and character-sheet film mode unchanged.

## Verification

- Redeploy `scenario-write`.
- Test via the edge function with `mode: "product-ad"`, a product `imageUrl`, and a `characterImageUrl` to confirm the returned scenario contains spoken character lines that advertise the product.
- Confirm a product-ad request **without** a character still returns a narration-free visual scenario (no regression).
