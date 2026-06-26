## Goal

In the prompt composer's **Prompt** menu, add a new action that writes an AI scenario tailored to the **pinned product** (selectedProduct), automatically respecting the chosen **duration** and any selected **styles**. Short durations produce a single prompt in the box; long durations produce a multi-scene scenario.

## Behavior

New menu item **"Scenario for this product"** appears as a third option in the Prompt popover (below *No narrator* / *With narrator* / *Styles*), using a `Package`/`Wand2` icon.

- **Disabled** (with hint text) when no product is pinned: "Pin a product first (Add product)".
- **Enabled** when `selectedProduct` is set. Clicking it:
  - **Short durations (5/10/15s):** generates ONE cinematic prompt about the product and writes it into the prompt box (fills `promptText`), closing the menu — same UX as the existing *No narrator* / *Styles* optimize.
  - **Long durations (30/45/135s):** generates a full scene-by-scene scenario for the product and routes it through the existing multi-scene path (the same `onUseAsPrompt` / scene-tagged prompt flow already used by Scenario Writer), so "send all scenes" continues to work.
- Always feeds the model: product title + description + product image URL, the selected `durationSeconds`, and (if any) the current `buildStyleHints(selectedStyles)`. Any text already in the prompt box is used as the user's idea/seed; if empty, the scenario is built purely from the product.

## Technical details

File: `src/modules/generator-ui/pages/DashboardPage.tsx`

1. **New handler** `runProductScenario()`:
   - Guard: return early if `!selectedProduct` or `isEnhancingPrompt || isSubmitting`.
   - Set `isEnhancingPrompt` true.
   - Build inputs: `idea = promptText.trim()`, `product = selectedProduct` (title/description/url), `styleHints = buildStyleHints(selectedStyles)`, `durationSeconds`.
   - For short durations: call the existing `enhance-prompt` edge function with `mode: 'silent'`, passing the product image in `imageUrls` and embedding product identity + duration guidance into the `prompt`/`styleHints` text (reusing `applyProductPrefix` wording so the product stays locked). On success, `setPromptText(enhanced)` and close menu.
   - For long durations (30/45/135): call the existing `scenario-write` edge function (already used at line ~6166) with the product context + `durationSeconds`, then hand the scene-tagged result to the existing scenario consumption path (`onUseAsPrompt` equivalent already wired at lines 9311-9322) so multi-scene send works unchanged.
   - Mirror existing error handling (429/402/generic) into `setComposerError`.

2. **New menu item** inside the Prompt `PopoverContent` (after the Styles button block, ~line 11987): a button calling `runProductScenario()`, disabled when `!selectedProduct`, showing product thumbnail when pinned and helper copy otherwise.

3. No backend/schema changes — reuse `enhance-prompt` and `scenario-write` edge functions, `applyProductPrefix`, `buildStyleHints`, and the existing scenario/scene plumbing.

## Validation

- `bun run tsc --noEmit` clean.
- Manually verify in preview: pin a product → open Prompt menu → new item enabled → short duration fills the box with a product prompt; 45s produces a multi-scene scenario that can be sent to Pending.

## Scope guard

Frontend/presentation only in DashboardPage. No changes to auth, storage policies, credit ledger, or generation/job logic beyond reusing existing prompt/scenario calls.