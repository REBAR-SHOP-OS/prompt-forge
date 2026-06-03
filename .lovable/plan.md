## Goal

The Scenario Writer should always generate an **advertising** scenario that follows a clear story arc — a defined beginning, a middle that builds, and a defined ending — regardless of whether the user writes their own idea or auto-generates from an image.

## Change

Edit the system prompt in `supabase/functions/scenario-write/index.ts` (`buildSystemPrompt`), which currently builds the persona/instructions for the non-product-ad path.

1. **Persona** — for both the "write my own" and "auto from image" cases, change the persona from a generic "professional short-form video scenario writer" to an **advertising creative director** who writes commercial scenarios. Keep the existing image-analysis instruction for the auto-from-image case.

2. **Narrative arc** — add explicit instructions to every scenario (single-scene and multi-scene durations) requiring:
   - A clear **hook / opening** that establishes subject and setting.
   - A **middle** that develops the story and builds interest/desire.
   - A **defined ending / payoff** (resolution or call-to-feel moment) so the scenario starts at one clear point and ends at another.
   - Advertising tone: persuasive, product/subject-forward, designed to sell or promote.

3. For multi-scene durations (30s/45s/135s) the arc should span the whole sequence: opening scene sets up, middle scenes build, final scene resolves — while keeping the existing `===SCENE===` delimiter, scene count, and 70–90 word per-scene rules unchanged.

No frontend or schema changes are needed — only the prompt text in the edge function. The edge function redeploys automatically.

## Files

- `supabase/functions/scenario-write/index.ts`
