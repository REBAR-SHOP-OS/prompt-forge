## Expected outcome
Product photos uploaded by the user to Storage → Products should reliably appear in the product picker, including inside **Generate image with AI → Select product**, and the selected product image should load from backend storage instead of disappearing due to stale/missing URLs.

## Constraints
- Keep the existing UI layout and generation flow unchanged.
- Do not touch auth, storage policies, unrelated backend frameworks, or video generation logic.
- Use existing `generator_user_images` rows and `user-images` storage bucket.

## Plan
1. **Create one reliable product loader in `DashboardPage.tsx`**
   - Add a focused helper that queries `generator_user_images` for the current user with `category = product`, `deleted_at IS NULL`, and includes title/description.
   - Sign every product image URL through the existing `signUserImageRows` / storage URL logic before putting it into state.
   - Merge by `id` so products uploaded in Storage and products already in memory do not duplicate or disappear.

2. **Load products when product-dependent UI opens**
   - When the AI image dialog opens, load product rows if the product list is empty or stale.
   - Keep the existing on-demand loading for the main “Add product” popover, but route it through the same reliable loader.
   - Avoid relying on the full archive dialog being opened first.

3. **Make product thumbnails self-heal**
   - Replace plain `<img>` usage for product thumbnails in product pickers with the existing `UserImageView` where available, so stale/private storage URLs get re-signed once before showing a placeholder.
   - In `AiImageDialog`, keep the current UI but add a small image-load fallback: if a product thumbnail or selected product fetch fails, surface a clear error and allow reselect after products are refreshed.

4. **Keep uploaded product rows durable**
   - For new product uploads, store the durable storage key/path consistently enough for signing, while still supporting old rows that contain full public/signed URLs.
   - After upload, immediately sign the stored image and add it to `archiveProductImages` so it appears without needing a refresh.

5. **Validate**
   - Verify the product query path and UI state path: uploaded product rows load into `archiveProductImages`, pass into `AiImageDialog.products`, and render in **Select product**.
   - Confirm empty state only appears when the backend returns no product rows.