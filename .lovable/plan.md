## Goal

Add a way to generate a character sheet **from a text prompt** — without having to upload a character photo first. The optional company-logo feature keeps working.

## Backend — `supabase/functions/generate-character-sheet/index.ts`

- Parse a new optional `prompt` field (string, trimmed, capped e.g. 1000 chars).
- Make `imageUrl` **optional**: require *either* a valid `imageUrl` *or* a non-empty `prompt`. Return 400 only when both are missing.
- When there is no source image (prompt-only mode):
  - Skip the source-image fetch.
  - Build instructions for a brand-new character described by the user's prompt, e.g.: *"Design an original character based on this description: «{prompt}». Then create a single clean character sheet (turnaround) of that character…"* plus the existing two-row turnaround + expressions layout rules.
  - Do **not** push a source `image_url` block; `userContent` starts with just the text instruction. The optional logo image block still appends when `applyLogo` + valid logo.
- When an `imageUrl` **is** present, keep current behavior unchanged (prompt, if also sent, can be ignored or appended as extra styling guidance — keep it simple: ignore prompt in image mode).
- Title for prompt-only rows: use `title` if sent, else a short slice of the prompt, else "Character sheet".

## Frontend — `src/modules/generator-ui/components/CharacterSheetDialog.tsx`

- Add a **"Describe a character"** section near the top (above or below the model selector): a `Textarea` bound to new `promptText` state and a **"Generate from prompt"** button.
- New handler `handleGenerateFromPrompt`:
  - Guard: non-empty `promptText`, `userId`, not already generating.
  - Reuse a generating flag (e.g. `generatingId === 'prompt'`) to show a spinner on the button.
  - Invoke `generate-character-sheet` with `{ prompt, model: sheetModel, title: '', ...(applyLogo && logoSendUrl ? { logoUrl: logoSendUrl, applyLogo: true } : {}) }`.
  - On success, prepend the returned sheet to `images` (same as `handleGenerateSheet`).
  - Surface errors via existing `setError`.
- The model selector and the logo controls already in the dialog apply to this flow too (logo already sent as a signed URL).

## Result

The Character Sheet dialog supports two paths: (1) upload a photo → Make sheet, and (2) type a description → Generate from prompt. Both honor the selected model and the optional company logo, and results land in the same gallery.