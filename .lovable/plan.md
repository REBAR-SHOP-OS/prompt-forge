## Goal
Make the generated film faithfully reproduce the selected product by ensuring the **real product photo** is what conditions Wan I2V, instead of relying on an AI re-draw that can substitute a look-alike.

## Root cause
- Default model `wan-i2v` (Wan 2.7 Image-to-Video) only conditions on the **start frame**; the `referenceImageUrls` carrying `selectedProduct.url` are ignored by the provider.
- The product reaches the model only via `bakeProductIntoFrame()` (an `ai-image-edit` redraw), which often produces a similar-but-not-exact product.
- When the user pins a product but uploads **no start frame**, no product conditioning happens at all (main flow even errors "Add a Start or End image"; scenario flow queues a text-only first scene).

## Fix (frontend only — `src/modules/generator-ui/pages/DashboardPage.tsx`)

### 1. New helper `productStartFrame(product, ratio)`
Returns a downloadable start-frame URL built **from the real product photo with no AI redraw**:
- If the product image already matches the target aspect ratio closely, return `product.url` unchanged.
- Otherwise call the existing `image-reframe` edge function to **pad/outpaint to the target ratio while keeping the original product pixels intact** (background extension only, product untouched), upload to `wan-frames`, return a signed URL.
- Non-destructive: any failure falls back to returning `product.url` directly so generation never breaks.

### 2. `handleSubmit` (single + N-clip path)
- When `selectedProduct` is set and there is **no** `readyStartFrame` and no character seed frame:
  - Set `bakedStartFrameUrl = await productStartFrame(selectedProduct, effectiveRatio)`.
  - Force `image-to-video` so the no-frame `else` branch ("Add a Start or End image") is no longer hit when a product is pinned.
- When the user **did** upload a start frame, keep current `bakeProductIntoFrame` behavior (their chosen scene, product composited in).

### 3. `submitScenesAsJobs` (Product scenario / multi-scene)
- For scene 0, if `startFrameUrl` is still empty after the character-frame step and `selectedProduct` is set, seed it with `await productStartFrame(selectedProduct, effectiveRatio)`.
- Keep the existing per-scene `bakeProductIntoFrame` so later scenes (seeded from previous frame) re-lock the exact product.
- Ensure the scenario runs on an I2V model when a product is pinned (mirror the character `toImageToVideoModel` logic).

### 4. Regenerate path
- When `selectedProduct` is set and the source clip has no `firstFrameUrl`, seed regeneration with `productStartFrame(...)` before the existing re-bake step.

### 5. Keep Wan as default
No model change. `referenceImageUrls` continue to be sent (harmless; used by Veo-family if ever selected), but correctness now comes from the real-photo start frame.

## Validation
- `tsgo` clean.
- Playwright smoke against the live preview: pin the rebar product, no uploaded frame, submit a 5s clip; confirm the job is created with `firstFrameUrl` pointing at a `wan-frames` product image (network inspection) rather than failing or going text-only.
- Confirm cloud/Veo flows and character-only flows are unaffected.

## Out of scope
No changes to generation UI layout, auth, storage policies, credit ledger, or edge-function business logic beyond using the existing `image-reframe`/`ai-image-edit` functions.