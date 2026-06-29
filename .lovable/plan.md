## Plan

### Verified state
- Active app route: `/` dashboard preview.
- Relevant files checked:
  - `src/modules/generator-ui/pages/DashboardPage.tsx`
  - `src/modules/generator-ui/lib/continuity.ts`
  - `src/modules/generator-ui/components/ProductAdDialog.tsx`
  - `supabase/functions/jobs-create/index.ts`
  - `supabase/functions/_shared/modules/job-orchestrator/service.ts`

### Likely cause
A stale persisted continuity anchor can still be applied even when the UI shows **Add character**.

The risky logic is:
```ts
const projectCharacter = selectedCharacter ?? continuity.characterRef ?? null
```
So if `selectedCharacter` is empty but `continuity.characterRef` still exists in local storage for that project/draft, generation can still:
- prepend character identity prompt text,
- create a character start frame,
- send character reference images,
- force image-to-video character behavior.

This matches the screenshot: the UI button says **Add character**, but the produced film contains a character.

### Fix to apply
1. Make the visible UI selection the only authority for character usage:
   - Change generation logic so `projectCharacter` comes only from `selectedCharacter`.
   - Do not silently fall back to `continuity.characterRef` during job creation.

2. Keep continuity memory safe:
   - Continuity can still preserve scene/environment/style between cards.
   - It must not apply character identity/reference unless the user explicitly selected a character in the current project UI.

3. Add a defensive cleanup path:
   - When loading a project/draft, if the selected character is absent, ensure any stale persisted `characterRef` is cleared for that chain.
   - Existing remove buttons will continue clearing both UI state and continuity state.

4. Fix regeneration safety:
   - Regenerate should preserve a card’s original reference images only if that card really had them.
   - It must not fall back to the current/stale project character when none is selected.
   - Product reference can still be used when a product is selected.

5. Add regression coverage:
   - Add/update a targeted test for the character-selection helper logic so: `selectedCharacter = null` + stale `continuity.characterRef` results in **no character reference URLs**.

### Verification
- Source check: confirm no generation path uses `continuity.characterRef` as a fallback character.
- Test check: run the targeted regression test.
- Manual expected behavior: if the button shows **Add character**, generated jobs must not include character prompt locks, character start frame generation, or character reference URLs. Product AD references should continue working.