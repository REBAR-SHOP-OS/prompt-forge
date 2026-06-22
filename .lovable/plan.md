## Goal

When the user clicks **Use as prompt** (or **Send to Pending**) from the Product Ad / Character scenario dialog, set up an image‑to‑video generation whose **start frame actually shows the character together with the product**, driven by the generated scenario text. Today the start frame is empty/broken and the character is dropped.

## Root causes

1. `ProductAdDialog.handleUseAsPrompt` (line 1093) passes `uploadedImageUrl` — a **private `wan-frames` public URL** that `handleUseImageAsStart` cannot `fetch()` → start frame fails silently (the empty thumbnail in the screenshot).
2. The attached character (`characterRefSendUrl`) is only sent to the scenario text writer, never used to build the video start frame, so the video would never feature the character.
3. For the Character‑sheet variant, `handleUseAsPrompt` passes `undefined`, so no start frame at all.

## Approach

Build a proper **first frame** before handing off to the composer, using the existing `ai-image-edit` edge function (it already accepts multiple reference images and returns a `dataUrl`).

### `ProductAdDialog.tsx`

Add a helper `buildFirstFrame()` that returns a fetchable image URL (data URL or signed URL) based on context:

- **Product variant + character attached** (`!isCharacter && characterRefSendUrl`):
  call `ai-image-edit` with `imageUrls: [productSendUrl, characterRefSendUrl]`, `aspectRatio` from the selected dimensions, and a prompt such as: *"Image 1 is the product, image 2 is the on‑screen character/presenter. Compose a single photorealistic opening ad frame where the character is presenting/holding the product, product clearly visible as the hero. Keep the character's face, hair, wardrobe and body identical to image 2."* Use the returned `dataUrl` as the first frame.
- **Product variant, no character:** use the **signed** product URL (`imagePreviewUrl` / `signFramesUrl`) — not the broken public URL.
- **Character variant:** use the character image (`imagePreviewUrl` signed) as the first frame.

Update `handleUseAsPrompt` and `handleSendAll` to `await buildFirstFrame()` and pass the resulting URL to `onUseAsPrompt(text, frameUrl)` / `onSendScenes(scenes, frameUrl)`. Add a loading state (e.g. disable the button + spinner + "Preparing frame…") because the compose call takes a few seconds, and surface any `ai-image-edit` error (429/402/empty) inline using the existing `setError`.

### `DashboardPage.tsx`

No signature change needed — `handleUseImageAsStart` already re‑fetches and re‑uploads the URL to `wan-frames`, and `fetch()` works on `data:` URLs. The handoff at lines 8341‑8381 stays as is (it already calls `handleUseImageAsStart(imageUrl)` and sets `generationMode` to image‑to‑video). Confirm the composed/signed URL is fetchable there.

## Verification

- Product Ad with a character attached → Use as prompt → start frame is populated with a composed character+product image, prompt filled, mode = Image to Video.
- Product Ad without a character → start frame shows the product (signed URL, not broken).
- Character variant → start frame shows the character.
- Confirm `ai-image-edit` errors (rate limit / credits / empty) show a clear message instead of an empty frame.

## Notes / trade-offs

- Composing the first frame consumes one AI image credit per use. This is the cleanest way to guarantee the character appears with the product in the video; the alternative (just using the character or product alone) would not satisfy "the character promoting that product."
