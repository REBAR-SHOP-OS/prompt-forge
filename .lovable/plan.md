## What's wrong

Looking at the screenshot, after **Apply edit** the painted red mask is still drawn over the image, so the user cannot tell whether the edit actually landed inside the painted region. The composite logic from the previous turn is correct (pixels outside the mask are byte-identical to the original), but the persistent red overlay visually hides the result and makes it look like "nothing happened in the marked area".

There is also a smaller robustness issue: when a refine produces a new image with different natural dimensions, the existing `syncCanvasSize` preserves the mask bitmap via `putImageData(0,0)`, which leaves it misaligned at the top-left instead of rescaled to the new size.

## Fix (frontend only — `AiImageDialog.tsx`)

1. **Clear the visible mask after a successful Apply edit** so the user immediately sees the result inside the painted region.
   - In `handleRefine`, after `setImageDataUrl(finalUrl)`, call `handleClearMask()` and `setIsMaskMode(false)`.
   - Drop the `lastImageSourceRef` "preserve mask on refine" behavior added in the previous turn — revert the `useEffect([imageDataUrl])` to always reset the mask. (User can repaint to iterate; this matches standard inpainting UX and removes the misalignment risk on dimension change.)

2. **Guarantee the mask canvas is sized to the image before the first stroke.**
   - In the `Edit area` toggle handler, after enabling mask mode, wait for the next animation frame (`requestAnimationFrame`) and then call `syncCanvasSize`, so we read the actually-laid-out image size (not the previous one).
   - On `pointerDown`, if `imgRef.current.naturalWidth === 0`, return early and show the toast/state instead of painting into a 300×150 default canvas.

3. **Stronger backend hint** (`supabase/functions/ai-image-edit/index.ts`) — small prompt tweak so the model also tries to respect the masked region (the local composite is the guarantee; this just improves the in-region content quality):
   - Prepend an explicit clause in English even when the user's prompt is non-English: `"Treat the second image as a strict edit mask. Only the white/opaque pixels of the mask define the editable region. Do not alter pixels where the mask is transparent. The user instruction (which may be in any language) describes what to put inside the masked region: <prompt>"`. Keep current 2-image message structure.

## Why this resolves the user's complaint

- After Apply edit, the red overlay disappears and the user can directly see the change inside the painted area.
- The local composite already guarantees outside-the-mask pixels are unchanged.
- The improved prompt makes the in-region change closer to the user's intent (e.g. "erase the marked parts" → model fills the region with plausible background).

## Verification

- Generate image → toggle **Edit area** → paint a region → type "erase the marked parts" / "remove this" → **Apply edit**.
  - Expected: red overlay is gone, the painted region shows the model's edit, everything else is pixel-identical to the previous frame.
- Repeat: paint a different region, apply another edit. Each apply uses a fresh mask, no leftover paint.
- Without painting → Apply edit → behaves as full-image edit (unchanged from today).
- Switch aspect, regenerate, paint, apply → mask aligns correctly with the new image dimensions.

## Out of scope

No DB, storage, or API surface changes. No change to `ai-image-generate`, `Use this image`, or the Start-frame wiring.
