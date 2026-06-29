## Problem
Clicking "Convert with Nano Banana" fails with `HTTP 400 error`. Network trace shows the failure is at the **storage upload step**, not the AI step:

```
POST /storage/v1/object/user-images/<uid>/reframe-input-....png
Status: 400 (nginx HTML "400 Bad Request")
```

`ImageReframeDialog.handleConvert()` uploads the picked file to the private `user-images` bucket, then takes `getPublicUrl()` and passes it to `image-reframe`. Two issues:
1. The upload itself is returning a raw nginx 400 (request rejected before storage logic), so the flow dies immediately.
2. Even when it succeeds, `user-images` is private, so the "public URL" can't be fetched and relies on a brittle service-client fallback inside the function.

The `image-reframe` edge function works fine (logs show successful conversions). The weak link is the intermediate browser→storage upload.

## Fix (safe, minimal, non-destructive)
Remove the fragile intermediate storage upload entirely and send the image bytes straight to the edge function as a base64 data URL. This eliminates the failing upload, the private-bucket public-URL mismatch, and the service-client fetch fallback — all in one step. Nothing else in the app changes; the function still outputs to `wan-frames` and returns a signed URL exactly as today.

### Frontend — `src/modules/generator-ui/components/ImageReframeDialog.tsx`
- In `handleConvert()`, drop the `supabase.storage.from('user-images').upload(...)` + `getPublicUrl()` block.
- Read the selected `file` into a base64 data URL (FileReader / `arrayBuffer` → base64).
- Keep the existing 10MB client-side guard.
- POST `{ imageBase64: <dataUrl>, aspectRatio: ratio }` to the `image-reframe` function with the same auth header.
- Keep the rest (signed-URL resolution of the returned `path`, toast, error handling) unchanged.

### Backend — `supabase/functions/image-reframe/index.ts`
- Accept a new optional `imageBase64` field (a `data:image/...;base64,...` URL).
- When present: validate the mime is png/jpeg/webp, decode it directly into `srcBytes`/`srcMime`, and skip the `isAllowedImageUrl` check and the public-fetch / storage-download path.
- Keep the existing `imageUrl` branch fully intact as a fallback (backward compatible — no other caller breaks).
- Enforce a sane size limit (reject decoded payloads over ~10MB) and return a clear 400 on a malformed/oversized data URL.
- Everything after source acquisition (Nano Banana call, ratio verification, upload to `wan-frames`, signed response) stays exactly as-is.

### Validate
- Redeploy `image-reframe`.
- Run the dialog with the transparent logo PNG at 9:16 and confirm a reframed image renders (no 400). Confirm cloud/AI path still returns 200 in function logs.

## Technical notes
- No DB, RLS, storage policy, or bucket changes.
- The `user-images` upload path is removed only from this dialog; if any other feature uploads there it is untouched.
- Backward compatible: `imageUrl` callers (if any) keep working.
</content>
<parameter name="summary">Fix Reframe 400 by sending the image to the edge function as base64 instead of the failing user-images storage upload.