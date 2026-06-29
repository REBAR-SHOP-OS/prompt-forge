## Goal
Add a fourth control — a **prompt-writer** icon — to the "Generate image with AI" dialog (the empty bottom-right area circled in the screenshot). When clicked, it analyzes the attached reference image(s) / selected product and the chosen theme, then writes a single polished, professional image-generation prompt and fills the Prompt textarea.

## Backend — new edge function `write-image-prompt`
File: `supabase/functions/write-image-prompt/index.ts`
- Why a new function: the existing `enhance-prompt` is video-oriented (cinematic motion / no-narration rules) and restricts image URLs to Supabase hosts only, but the dialog's references are base64 data URLs. A small dedicated function is the clean, safe choice and won't touch the working video flow.
- Standard boilerplate: CORS on every response (incl. errors), JWT validated in code, Zod-validate the body.
- Input: `{ themeDescriptor?: string, themeLabel?: string, existingPrompt?: string, referenceImages?: string[] (base64 data URLs, max 4) }`.
- Calls Lovable AI Gateway model `google/gemini-2.5-flash` via multimodal chat completions: text instruction + `image_url` blocks for each reference data URL.
- System instruction: act as an expert image-prompt engineer; analyze the references (products, lighting, materials, composition), incorporate the theme descriptor, and output ONE concise, vivid, professional English image prompt (no explanations, no markdown, no quotes). Mirror the language already typed in `existingPrompt` if non-English; default English.
- Returns `{ prompt: string }`. Surface 429/402 gateway errors clearly.
- Deploy the function.

## Frontend — `AiImageDialog.tsx`
- Add a `Wand2`-style "Write prompt" icon button placed in the bottom-right of the Prompt textarea (the circled spot). Since the three existing buttons use hardcoded absolute left offsets and already crowd the row, anchor the new button at `absolute bottom-3 right-3` so it does not collide.
- New state: `isWritingPrompt`. On click: gather `referenceImages` data URLs, the selected theme's `descriptor`/`enLabel`, and current `prompt`; invoke `write-image-prompt`; on success set `prompt` to the returned text; show spinner + disable while running; reuse existing `extractFnError` for errors.
- Button disabled while `isLoading`/`isWritingPrompt`. Tooltip: "Write a professional prompt from your references & theme".

## Technical notes
- No changes to generation UI logic, auth, storage policies, or the video pipeline.
- Reference images are already kept as base64 data URLs in `referenceImages`, so no extra conversion needed.
- Verify with a live `curl` test of the new function and a TS typecheck after wiring.
