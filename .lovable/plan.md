## Problem

The Reframe result crops/offsets the subject instead of outpainting around it. In the screenshot, the original 1:1 poster ends up pushed to the right of the 9:16 frame with the left side cut off, instead of sitting centered with extended background above and below.

Root cause: we send the raw image + a text instruction to `google/gemini-2.5-flash-image` and hope it composes a new canvas. Nano Banana does not reliably resize/recompose; it tends to return the input near-original or shifted, so the visible "9:16 result" is mostly the dialog's CSS frame, not a true reframe.

## Fix

Pre-compose a canvas at the exact target aspect ratio in the edge function before calling the model, with the original image centered on a neutral/transparent background, then ask Nano Banana to *fill the empty areas* (true outpainting). This gives the model a deterministic canvas to extend, so the subject stays centered and untouched.

### Edge function changes (`supabase/functions/image-reframe/index.ts`)

1. Fetch the input `imageUrl` as bytes server-side.
2. Decode dimensions (use a lightweight Deno image lib, e.g. `imagescript` via esm.sh) and compute a target canvas:
   - For `9:16`, `1:1`, `16:9`, pick canvas dims so the original fits fully inside (contain), centered, with transparent (or mid‑gray) padding on the sides that need extending.
   - Cap longest side at ~1536 px to keep model latency/cost sane.
3. Encode that padded canvas as PNG and pass it as the `image_url` (data URL) to Nano Banana.
4. Tighten the instruction: "The image already has the correct ${ratio} canvas. The subject is centered. Only fill the empty/transparent padded regions by naturally extending the existing background, lighting, and texture. Do not move, scale, recolor, or alter the subject in any way. Return the full canvas at the same dimensions."
5. Keep current upload-to-`user-images` + public URL response.

### Frontend changes (`src/modules/generator-ui/components/ImageReframeDialog.tsx`)

- Change the result preview from `object-cover` to `object-contain` so we never visually crop the model output (current `object-cover` hides real failures).
- Minor: show the actual returned image dimensions under the preview for quick QA.

## Out of scope

- No changes to Final Film, Voiceover, Soundtrack, Start/End frame wiring, jobs, or RLS.
- Model stays `google/gemini-2.5-flash-image` (Nano Banana). No new secrets.

## Validation

- Re-run the same `rebar_stirrups_small_content.webp` at 9:16 and 16:9; subject must remain centered and uncropped, with only background extended.
- Check edge function logs for the new request shape and image size.
