## Goal
Allow uploading several product photos at once in the STORAGE → "Upload a product photo" panel, instead of one file at a time.

## Changes (all in `src/modules/generator-ui/pages/DashboardPage.tsx`)

### 1. Product photo `<input>` (around line 6875)
Add `multiple` to the file input so the OS file picker allows selecting several images.

### 2. `handleProductPhotoSelected` (lines 3988–4033)
Rewrite to process all selected files instead of only `files?.[0]`:
- Read `event.target.files` into an array; return if empty / no `userId`.
- Set uploading state once.
- Loop over each file:
  - Validate type is `image/*` and size ≤ 10 MB; skip invalid files and collect a per-file error message (e.g. "name.png: must be smaller than 10 MB") rather than aborting the whole batch.
  - Upload to storage, insert the `generator_user_images` row (`category: 'product'`), and prepend the returned row to `archiveProductImages`.
- After the loop: clear `productName`, reset the input value, and show a combined error string only if some files failed. Successfully uploaded files still appear.
- Keep the existing single-file behavior intact (one file still works).

## Notes
- Same product-name field applies to the batch (current behavior reuses one name field); each uploaded photo gets that title. No new UI needed beyond enabling multi-select.
- No backend/schema changes — uses the existing bucket and table.
- Verify after build that selecting multiple images uploads all of them and the count badge updates.