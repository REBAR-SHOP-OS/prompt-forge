## Goal
In the "Add text on the image?" popover (Write prompt → With text) inside `AiImageDialog.tsx`, the advertising taglines must be generated strictly from the user's **selected product**. If no product is selected, no taglines should appear at all.

## Current behavior
- `loadTaglines()` (line ~592) calls the `write-image-prompt` edge function in `mode: 'taglines'`, passing `productName` derived from `referenceImages.find(r => r.isProduct)`.
- It only blocks when `hasPromptInputs()` is false — so it still produces generic taglines (e.g. "Build your legacy") even when there is no product, just from theme/reference image/prompt text.

## Changes (frontend only)

1. **Gate `loadTaglines()` on a selected product** (`src/modules/generator-ui/components/AiImageDialog.tsx`):
   - Compute `productRef = referenceImages.find(r => r.isProduct)` at the top of the function.
   - If `!productRef`, do not call the function: clear `taglines`, and set a clear message like `"Select a product first to generate taglines."` (English, per project convention).
   - Keep passing `productName` from the product when present.

2. **Reflect the gate in the popover UI** (lines ~1189–1234):
   - When no product is selected, the **"With text"** button should be disabled (or, on click, surface the same "Select a product first" hint) and the "Pick a tagline" list must stay hidden.
   - Keep **"Without text"** fully working regardless of product selection.

3. **No backend change** — the edge function already accepts `productName` and uses it; we simply never request taglines without a product, so no generic text is shown.

## Result
- Product selected → taglines reflect that product.
- No product → no taglines displayed; only a short hint, with "Without text" still available.