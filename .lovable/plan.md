## Problem

The composer's Start/End frame thumbnail (and its zoom preview) shows empty/black. The `wan-frames` bucket is **private**, but frame URLs are created with `supabase.storage.from(FRAMES_BUCKET).getPublicUrl(...)`. A public URL on a private bucket returns HTTP 400, so the `<img src={file.url}>` thumbnail never loads.

This is the same class of bug already fixed for the logo and for `ai-image-edit`: private bucket + public URL = broken image.

## Fix

Sign frame URLs the same way user-image thumbnails are already signed (`signUserImageUrl`). A year-long signed URL loads in `<img>` and is also fetchable by the render backend, so it's strictly safer than the current broken public URL.

### `src/modules/generator-ui/pages/DashboardPage.tsx`

1. **Add a `signFramesUrl` helper** next to `signUserImageUrl` (around line 333): same logic but against `FRAMES_BUCKET` — extract the bucket-relative key from a stored value, call `createSignedUrl(key, 1 year)`, and fall back to the raw value on failure. Pass-through for `blob:`/`data:`/already-signed URLs.

2. **Replace `data.publicUrl` with the signed URL at every frame-upload completion point** where the result is stored into `uploadedFiles[].url` for display:
   - `handleUseImageAsStart` (~line 4816–4820)
   - the staging handler at ~line 4869–4872
   - the Start/End upload handler at ~line 5731–5735 and ~line 5798–5802
   - the handler at ~line 8317–8321

   Each becomes: upload → build storagePath → `const url = await signFramesUrl(storagePath)` (fallback to `getPublicUrl().data.publicUrl`) → set `file.url = url`.

3. **Leave the scene-chain seed-frame URL (~line 5577) as-is** unless needed, since that value is passed to the render pipeline rather than displayed; but if it also feeds a preview, sign it too. (Will verify during build and sign it as well if it surfaces in any thumbnail.)

## Result

Start/End frame thumbnails and their zoom preview always render the actual image instead of an empty box, because the displayed URL is now a valid signed URL for the private bucket.