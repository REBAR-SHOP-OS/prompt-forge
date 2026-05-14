# Veo PROVIDER_ERROR — root cause

Edge function logs show:
```
veo create failed ... `inlineData` isn't supported by this model.
model: veo-3.1-generate-preview
```

## Root cause

`startVeo` (and `startVeoExtension`) wrap image/video payloads as `{ inlineData: { mimeType, data } }`. That shape belongs to the **Gemini `generateContent`** API. The Veo `predictLongRunning` endpoint is a **Vertex prediction** API and expects:

```json
{ "bytesBase64Encoded": "<base64>", "mimeType": "image/png" }
```

So every image-to-video and every extension call is rejected with HTTP 400 → orchestrator surfaces `PROVIDER_ERROR: The video provider could not start generation`. This is why both the original "10/15s" extension and the current "image-to-video" both fail — same wrong wrapper.

## Fix (single file: `supabase/functions/_shared/modules/external-api-adapter/service.ts`)

1. In `startVeo`, replace:
   - `instance.image = { inlineData: await fetchAsInlineData(url) }`
   - `instance.lastFrame = { inlineData: await fetchAsInlineData(url) }`
   
   with the Veo-native shape:
   - `instance.image = { bytesBase64Encoded: data, mimeType }`
   - `instance.lastFrame = { bytesBase64Encoded: data, mimeType }`

2. In `startVeoExtension`, replace the `video: { inlineData: { mimeType, data } }` payload with `video: { bytesBase64Encoded: data, mimeType: "video/mp4" }`.

3. `fetchAsInlineData` already returns `{ mimeType, data }` — keep the helper, just rename usage / map fields. No new helper needed.

No other files touched. No DB, no frontend, no gateway logic changes. Wan path is untouched.

## Verification

- Submit image-to-video with Start frame only → expect `200` from `predictLongRunning`, no `inlineData` error in `jobs-create` logs, video completes.
- Submit image-to-video with Start + End frames at 8s → expect interpolated clip.
- Submit 15s with Start + End → first 8s clip succeeds, extension call succeeds (no `inlineData` error), final merged 15s mp4 returned.
