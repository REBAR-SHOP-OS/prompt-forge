# Fix: reframed image rejected as Start frame

## Root cause

The video job validator (`supabase/functions/_shared/modules/job-orchestrator/gateway.ts`) only accepts `firstFrameUrl` / `lastFrameUrl` that point to `…/storage/v1/object/public/wan-frames/{userId}/…`.

Currently the `image-reframe` edge function uploads its output to a different bucket:

```
path = `${auth.userId}/reframed-${Date.now()}-${aspectRatio.replace(":", "x")}.${ext}`
svc.storage.from("user-images").upload(path, …)
```

When the user clicks **Use as Start frame**, that `user-images` URL is attached to the upload list and sent to `jobs-create`, which rightfully rejects it with:

```
INVALID_FIRST_FRAME_URL: firstFrameUrl must point to your own public wan-frames upload
```

So the reframed image is valid, but it lives in the wrong bucket.

## Fix

Make the reframe pipeline write its result into the same bucket the video pipeline expects, using the same per-user prefix convention as regular frame uploads (`{userId}/...`).

### Change

File: `supabase/functions/image-reframe/index.ts`

- Replace the upload target bucket from `"user-images"` to `"wan-frames"`.
- Keep the path shape `{userId}/reframed-{timestamp}-{ratio}.{ext}` — it already matches the `wan-frames/{userId}/` prefix the validator requires.
- Return the resulting `wan-frames` public URL as `publicUrl` (no client-side change needed).

No other files need to change:
- `ImageReframeDialog.tsx` already forwards whatever `publicUrl` the function returns to `onUseAsStartFrame`.
- `handleReframeAsStart` in `DashboardPage.tsx` injects the URL into `uploadedFiles` with `status: 'ready'`, which then flows into `jobs-create` exactly like a normal frame upload.
- `wan-frames` bucket is already public and writable via the service role key the edge function uses, so RLS is not an issue.

## Why this is the right fix

- Single source of truth: any image meant to seed a video lives in `wan-frames/{userId}/`.
- No weakening of the security validator (we keep the strict `wan-frames` allow-list).
- No duplicate copy step on the client; the file is written to the correct bucket on first upload.
- Backwards compatible: `Download` button still works (it just downloads from the new URL), and the reframed preview in the dialog still renders.

## Out of scope

- The previously-uploaded `user-images/...reframed...` files are left as-is; they are unused going forward.
- No DB migration, no auth change, no UI change.
