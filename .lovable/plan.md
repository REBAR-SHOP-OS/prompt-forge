## Goal
When "Write prompt" generates an image prompt for a product, the prompt should also describe a short **advertising text (tagline) rendered on the image**. That overlay text must be purely promotional — no factual claims, no guarantees/warranties, no superlatives that assert proof.

## Where
The behavior lives in the `write-image-prompt` edge function (`supabase/functions/write-image-prompt/index.ts`), which builds the system + instruction sent to the AI. A small signal is added from the client (`AiImageDialog.tsx`).

## Changes

### 1. Client — `AiImageDialog.tsx` (`handleWritePrompt`)
- Detect whether a product is part of the references (the dialog already tracks product references). Pass a new flag `includeAdCopy: true` (and optionally the product title) in the `supabase.functions.invoke('write-image-prompt', { body: ... })` call so the function knows to request on-image ad text.

### 2. Edge function — `write-image-prompt/index.ts`
- Read the new optional `includeAdCopy` (boolean) and `productName` (string) from the body.
- Extend `SYSTEM_PROMPT` / instruction so that when `includeAdCopy` is true, the final image prompt explicitly includes a short, legible **advertising headline/tagline composited onto the image** (good placement, readable typography, fits the chosen aspect ratio).
- Add strict guardrails for that on-image text:
  - Promotional/brand-style tone only (e.g. evocative tagline).
  - **No factual or performance claims** (no "strongest", "best", "#1", "certified", numbers/specs presented as fact).
  - **No guarantees / warranties** ("guaranteed", "lifetime warranty", "100%", "risk-free", etc.).
  - Keep it short (a few words), in the same language as the existing prompt text, English by default.
- Keep current behavior unchanged when `includeAdCopy` is false (cloud/theme/reference-only prompts still work).

### 3. Verify
- Call the deployed function via the edge-function test tool with `includeAdCopy: true` + a sample product/theme and confirm the returned prompt mentions an on-image tagline and contains no claim/guarantee wording.

## Technical notes
- This is a prompt-content change only; no schema, auth, storage, or generation-pipeline changes.
- Uses the existing Lovable AI Gateway call (`google/gemini-2.5-flash`) already in the function.