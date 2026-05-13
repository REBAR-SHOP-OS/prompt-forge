## Problem

When the user toggles **Edit area**, paints a region, writes a prompt, and clicks **Apply edit**, the result currently changes pixels outside the painted region too.

Root cause: the Gemini Nano Banana edit model does *not* perform true inpainting. Even when we send the original + a mask + a strict instruction, the model regenerates the whole frame, and any pixel can drift (composition, lighting, faces, background). A text instruction alone cannot guarantee "only these pixels change".

The only deterministic fix is to **composite the result locally**: keep the original everywhere outside the mask, and only paste the model's output inside the mask.

## Fix (frontend only)

File: `src/modules/generator-ui/components/AiImageDialog.tsx`

1. In `handleRefine`, after we receive the model's `dataUrl` and normalize it, do a local canvas composite **before** calling `setImageDataUrl`:
   - Load the **original** image (`imageDataUrl` at the time of the click) and the **edited** image at the same pixel size as the displayed image (use the larger of the two natural sizes; both will already match the chosen aspect after `normalizeImageAspect`).
   - Resize the painted mask canvas to that same pixel size with `drawImage` (nearest match is fine; we will feather next).
   - Build a feathered alpha mask: copy the painted alpha to an offscreen canvas, run a small `ctx.filter = 'blur(<~1.5% of width>px)'` redraw so the mask edge is soft (avoids visible seams).
   - Composite: draw original → set `globalCompositeOperation = 'destination-out'` with the feathered mask to punch a hole → set `'destination-over'` and draw the edited image to fill only the hole. (Equivalently: draw edited, mask it via `destination-in`, then draw original behind via `destination-over`.)
   - Export the composite as a PNG data URL and pass it to `normalizeImageAspect` (no-op if already correct) → `setImageDataUrl`.
2. Keep sending `maskUrl` to the edge function as a hint — it still helps the model focus its changes inside the region, which improves blend quality. No backend change required.
3. Preserve the painted mask after a refine so the user can iterate ("Apply edit" again with a new prompt on the same area). Today the mask is cleared by the `useEffect` on `imageDataUrl`; change that effect to only clear when a brand-new `handleGenerate` produces an image, not when `handleRefine` updates it. Implementation: track the last source (`'generate' | 'refine'`) in a ref and skip the reset on `'refine'`. **Clear** button still works.
4. Edge case: if `hasMask` is false at refine time, behave exactly as today (full-image edit, no compositing).

## Why this is safe

- Pure presentation change inside one component; no API, schema, or business-logic changes.
- The composite is deterministic: pixels outside the painted (feathered) region are byte-identical to the original.
- Aspect ratio is preserved because both images already pass through `normalizeImageAspect(aspect)`.

## Verification

- Open AI image dialog → Generate → toggle **Edit area** → paint over the chalkboard text in the reference screenshot → prompt "replace text with: Happy Birthday Dad" → **Apply edit**.
  - Expected: only the chalkboard region changes; faces, plants, rug, sweater, lighting are pixel-identical to the previous frame.
- Without painting (no mask) → Apply edit → behaves like before (full-frame edit).
- Paint → Apply edit → Apply edit again with a different prompt → mask is still active; second edit also only touches the painted area.
- **Clear** removes the mask; subsequent edits affect the whole frame.
- **Use this image** still saves the composited result and loads it as the Start frame.

## Out of scope

- No change to `ai-image-edit` edge function, no change to `ai-image-generate`, no DB or storage changes.
