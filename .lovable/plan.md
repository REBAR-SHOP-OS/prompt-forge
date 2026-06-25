## Goal
Make generated clips show the product **exactly** like the pinned Product reference photos.

## Root cause
The project generates with **Wan 2.7 Image-to-Video**. Wan only conditions on **one real image — the start frame** (plus optional end frame). The pinned product reference URLs are **not** sent to Wan as images; they are only appended into the text prompt as URLs (`augmentPromptWithReferences` / `applyProductPrefix`), which Wan cannot fetch or look at. So Wan never sees the product photo — it only reproduces whatever is already in the start frame. For card 2+, the start frame is the previous clip's last frame (already drifted), so the product keeps degrading.

## Fix (chosen approach: bake the product into each start frame)
Before each clip is queued, when a product is pinned, composite the **real product image** into that clip's start frame using the existing `ai-image-edit` function (Nano Banana, multi-image edit), then use the composited frame as `firstFrameUrl`. This way Wan literally sees the true product in its only image input.

### Technical steps

1. **New helper in `DashboardPage.tsx`** — `bakeProductIntoFrame(startFrameUrl, product, ratio)`:
   - Calls `supabase.functions.invoke('ai-image-edit', { body: { imageUrls: [startFrameUrl, product.url], aspectRatio } })` with an instruction like: *"Replace/insert the advertised product in image 1 with the EXACT product shown in the reference image (image 2): same shape, color, materials, label/logo, proportions. Keep the rest of the scene, character, pose, lighting and composition unchanged."*
   - `ai-image-edit` returns a `dataUrl`. Upload that data URL to the `wan-frames` (`FRAMES_BUCKET`) bucket and return its public URL (reuse the existing frame-upload pattern at lines ~5407/6216).
   - If no start frame exists (pure text-to-video first card) or the edit fails, fall back gracefully to the original `startFrameUrl` so generation never breaks (non-destructive).

2. **Wire it into the generation paths** where a product is pinned (`selectedProduct`):
   - **Multi-scene** (`submitScenesAsJobs`, ~6284–6305): after `startFrameUrl` is resolved for each scene, run `bakeProductIntoFrame` and pass the baked URL as `firstFrameUrl`.
   - **Single-card main submit path**: same baking step before `createJob`.
   - **Regenerate path** (~6589): bake into the preserved `firstFrameUrl` when the project still has a pinned product.
   - Card 1 with a user-uploaded start frame: bake too, so even the first clip matches the real product.

3. **Keep the existing text lock** (`applyProductPrefix` / `PRODUCT IDENTITY LOCK`) as reinforcement — it still helps Wan keep the baked product stable across motion.

4. **UX**: show a progress message ("Locking product into start frame…") during the bake so the extra image step is visible. One extra `ai-image-edit` call per clip.

### Files touched
- `src/modules/generator-ui/pages/DashboardPage.tsx` (new helper + wiring in the three generation paths).
- No backend/schema/provider changes; `ai-image-edit` already supports multi-image edits and the `wan-frames` bucket already exists.

### Notes / trade-offs
- Adds one image-edit step (and a small wait) per clip that has a pinned product. Cloud AI image credits only — no provider switch, Wan stays the generator.
- Fully non-destructive: any failure falls back to the current behavior.
