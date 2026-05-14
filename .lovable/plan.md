# Veo: Support End Frame Like Wan

## Diagnosis

Today our Veo integration uses `veo-3.0-fast-generate-001`, which **does not support a last frame**. Our code in `startVeo` (service.ts) explicitly logs and discards `lastFrameUrl`:

```ts
if (input.lastFrameUrl) {
  logError("veo last_frame ignored", { reason: "Veo 3 does not support a last frame" });
}
```

So even when the user attaches a Start and an End image, only the Start image reaches Veo and the End image is silently dropped.

Google now ships **Veo 3.1**, which adds first+last frame interpolation through the same `predictLongRunning` REST endpoint. The body shape is:

```json
{
  "instances": [{
    "prompt": "...",
    "image":     { "inlineData": { "mimeType": "image/png", "data": "<base64 first>" } },
    "lastFrame": { "inlineData": { "mimeType": "image/png", "data": "<base64 last>"  } }
  }]
}
```

This is exactly what Wan already does and what the user wants.

## Fix

Edit `supabase/functions/_shared/modules/external-api-adapter/service.ts` only. No DB / UI / orchestrator changes needed.

1. **Switch model** so Veo accepts `lastFrame`:
   - In `resolveVeoModel`, map `flow-video-1` → `veo-3.1-generate-preview` (was `veo-3.0-fast-generate-001`).
   - Update `COST_MAP` to include `veo-3.1-generate-preview` with the same per-1k-char placeholder cost as before.
2. **Send the last frame** in `startVeo`:
   - Remove the "veo last_frame ignored" branch.
   - When `input.lastFrameUrl` is set, fetch it via the existing `fetchAsBase64` helper and add `instance.lastFrame = { inlineData: { ... } }`.
   - Keep the existing `instance.image = ...` for the first frame.
3. **Keep everything else** identical: aspect ratio mapping, polling, mp4 re-upload to `merged-videos`, progress estimation, error handling.

## Out of scope

- No change to Wan, no change to the 8-second clamp (Veo 3.1 still maxes around 8s; the existing `VEO_DURATION_UNSUPPORTED` gate stays).
- No frontend changes — `Start` and `End` slots already exist and already send both URLs to the backend; today they're just being ignored on the Veo side.
- No new secrets — uses the same `GEMINI_API_KEY`.

## Verification

1. Image-to-video, only Start frame, Veo → still works.
2. Image-to-video, Start + End frames, Veo → output interpolates from Start to End (matches Wan behavior).
3. Image-to-video, only End frame, Veo → works (Veo 3.1 accepts lastFrame without firstFrame? — fall back to "Start required" if the API rejects it; we'll keep current "at least one frame" semantics and let Veo error surface naturally).
4. No `"veo last_frame ignored"` entries in edge function logs anymore.
5. Wan provider unaffected.
