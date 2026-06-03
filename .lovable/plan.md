# Allow Multiple Reference Images in "Generate image with AI"

Currently the dialog (`AiImageDialog.tsx`) accepts only a single reference image, and the `ai-image-edit` edge function accepts only one `imageUrl`. This plan upgrades both to support multiple reference images (up to 4).

## Frontend — `src/modules/generator-ui/components/AiImageDialog.tsx`

1. **State**: replace `referenceImage: AiReferenceImage | null` with `referenceImages: AiReferenceImage[]` (array). Reset to `[]` on dialog open.
2. **File input**: add `multiple` attribute to the hidden `<input type="file">`. Update `handleReferenceChange` to iterate over all selected files, convert each to a data URL, and append to the array (enforce a max of 4, show an error if exceeded).
3. **Add / remove**: 
   - The button label becomes "Add image" (instead of "Replace image"); clicking it lets the user add more.
   - Each thumbnail gets its own remove (X) button that removes only that image.
4. **Preview list**: render the selected references as a list/grid of thumbnails with name + per-item remove button.
5. **Generate logic** (`handleGenerate`): 
   - If `referenceImages.length > 0` → call `ai-image-edit` with the new `imageUrls` array (send all references).
   - If empty → call `ai-image-generate` as today.
6. Keep the single-image refine/mask flow unchanged (refine still operates on the generated result).

## Backend — `supabase/functions/ai-image-edit/index.ts`

1. Accept a new `imageUrls: string[]` field (keep backward-compatible support for the existing single `imageUrl`).
2. Validate each URL with the existing rules (data URL or allowed Supabase https, size limit) — reject if any is invalid; cap the count at 4.
3. Build the model message content with a text instruction plus one `image_url` entry per reference image, so the model uses all of them as references.
4. When a `maskUrl` is provided (refine flow) it still uses a single original image — that path is unchanged.

## Technical notes
- Max 4 reference images to stay within payload/size limits.
- No database or storage schema changes; references are sent inline as data URLs.
- Edge function deploys automatically after the edit.

## Files
- `src/modules/generator-ui/components/AiImageDialog.tsx`
- `supabase/functions/ai-image-edit/index.ts`
