# Add Reference Images to the "Refine with AI" Step

The "Generate" step now supports multiple reference images, but the **Refine with AI (Nano Banana edit)** step (shown after an image is generated) only supports a text prompt + optional mask. This adds the ability to attach reference images during refine, so the edit can follow other shots/products.

## Frontend — `src/modules/generator-ui/components/AiImageDialog.tsx`

1. **State**: add `refineReferenceImages: AiReferenceImage[]` (separate from the generate-step references). Reset to `[]` on dialog open, after a successful refine, and on discard/regenerate.
2. **File input**: add a second hidden `<input type="file" multiple>` (own ref) for the refine section, with an "Add image" button placed in the Refine header next to the Edit-area controls. Reuse the same add/validate logic (max 4, image-only) used by the generate step.
3. **Thumbnails**: render the selected refine references as a small thumbnail list under the refine textarea, each with an individual remove (X) button.
4. **`handleRefine`**: 
   - Build `imageUrls = [originalUrl, ...refineReferenceImages.map(r => r.dataUrl)]`.
   - Send that array to `ai-image-edit` (instead of single `imageUrl`).
   - The mask flow stays mask-only on the base image: when a mask is active, ignore extra references for that call (mask edits a specific region of the original). Show the references only as supported when no mask is painted, or simply skip them while masking. Keep current mask compositing unchanged.
5. After a successful apply, clear the refine references along with the mask/prompt.

## Backend — `supabase/functions/ai-image-edit/index.ts`

Already accepts an `imageUrls` array (added previously). Minor refinement:
- In the non-mask branch, when more than one image is sent, treat **image 1 as the base to edit** and the remaining images as **references** (update the multi-image instruction text to say: edit/transform image 1 according to the prompt, using the other images as visual references). This keeps both generate-step (combine references) and refine-step (edit base + references) behavior sensible.

## Technical notes
- Max 4 total reference images in refine, same as generate.
- No DB/storage changes; images sent inline as data URLs.
- Edge function redeploys automatically.

## Files
- `src/modules/generator-ui/components/AiImageDialog.tsx`
- `supabase/functions/ai-image-edit/index.ts`
