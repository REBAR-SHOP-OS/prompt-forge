## Problem

In the **Reframe image** dialog the converted result shows a broken image icon (the yellow-circled area in the screenshot). The Nano Banana conversion actually succeeds on the backend — the failure is purely in how the result image URL is built on the frontend.

## Root cause

The `image-reframe` edge function uploads the result into the **`wan-frames`** storage bucket and returns both `publicUrl` and `path`. I verified in the database that `wan-frames` is **private** (`public = false`).

`ImageReframeDialog.tsx` uses the returned `publicUrl` directly as the `<img src>`:

```ts
setResultUrl(json.publicUrl as string)
```

A public URL for a private bucket returns 400/404, so the `<img>` can never load → broken image. The rest of the app already knows this: `DashboardPage.signFramesUrl()` and `ProductAdDialog` both **sign** wan-frames paths before display. The reframe dialog is the one place that was missed.

## Fix (safe, minimal, mirrors existing pattern)

Edit only `src/modules/generator-ui/components/ImageReframeDialog.tsx`:

1. After a successful response, resolve a working **signed URL** from the returned `path` instead of trusting `publicUrl`:
   - Call `supabase.storage.from('wan-frames').createSignedUrl(json.path, 60*60*24*365)`.
   - Use the signed URL for `resultUrl` (display, Download, and "Use as Start frame").
   - Fall back to `json.publicUrl` only if signing fails, so behavior never regresses.
2. Keep everything else unchanged — bucket stays private (no security change), no edge-function change, no schema change.

This keeps the private bucket intact (principled, no widening of access) and matches the signed-URL convention already used everywhere else in the app.

## Verification

- Open Reframe image, upload the logo, pick 9:16, Convert → the right-hand "Reframed" panel renders the actual outpainted image instead of a broken icon.
- Download and "Use as Start frame" both work because they now receive a loadable URL.
- Confirm no TypeScript errors.

### Technical note
No backend, RLS, or storage-policy changes. The only file touched is the reframe dialog; the change is limited to URL resolution for the result image.