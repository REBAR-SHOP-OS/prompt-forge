# Fix: "Edge Function returned a non-2xx status code" in Generate image with AI

## Root cause

Edge function logs show the model `google/gemini-3.1-flash-image-preview` is returning **text** (a Persian explanation of cricket in Canada) instead of an image. The function then returns 502 "No image returned", and the client surfaces only the generic Supabase error "Edge Function returned a non-2xx status code".

Why the model returns text: the user's prompt "در مورد کریکت در کانادا" ("about cricket in Canada") is a topic/question, not a visual scene description. The image-preview model interprets it as a chat question and replies in text. The current edge function sends the raw prompt with no instruction enforcing image output.

Two real problems to fix:
1. The model is not reliably forced into image-generation mode for non-imperative prompts.
2. When the model does fail, the client shows a useless generic error instead of the real reason.

## Changes

### 1. `supabase/functions/ai-image-generate/index.ts`
- Wrap the user prompt with a strict image-generation instruction so the model always renders a visual:
  `"Create a single high-quality photographic image that visually depicts the following subject. Do NOT respond with text, explanations, or captions — output ONLY the image.\n\nSubject: <prompt>\n\n<ratioGuidance>"`.
- If the first call returns no image (current "No image returned" branch), automatically retry **once** with the stable fallback model `google/gemini-2.5-flash-image` (Nano Banana) using the same wrapped prompt.
- If both calls return no image, respond with status `422` and a specific message: `"The AI returned text instead of an image. Try a more visual prompt (describe a scene, subject, lighting, style)."` so the client can show it.
- Keep the existing 429 / 402 / 5xx branches as-is.

### 2. `supabase/functions/ai-image-edit/index.ts` (same class of bug, optional safety net)
- Apply the same retry-with-fallback-model pattern when the edit endpoint returns no image, so refines fail with a clear message rather than a generic 502.

### 3. `src/modules/generator-ui/components/AiImageDialog.tsx`
- In `handleGenerate` and `handleRefine`, when `supabase.functions.invoke` returns an error, read the JSON body's `error` field (via `fnErr.context?.response?.json()` fallback to `fnErr.message`) and show that as the error string, so the user sees the real cause ("The AI returned text instead of an image…") instead of "Edge Function returned a non-2xx status code".

## Out of scope
- No changes to authentication, storage upload, mask compositing, or `normalizeImageAspect`.
- No new models added to the catalog; only an existing fallback already in the AI Gateway.
- No UI redesign of the dialog.

## Verification
- Generate with prompt "در مورد کریکت در کانادا" — expect either a generated image (after the wrapped prompt forces image mode) or a clear in-dialog error explaining the prompt needs to be more visual.
- Generate with a normal visual prompt (e.g. "a cinematic shot of a cricket match in a Canadian autumn park") — expect success on the first model.
- Check edge function logs no longer show repeated "empty image" entries for typical prompts.
