## Goal

Add a **company logo** capability to the Character Sheet dialog. The user can upload their own logo, and choose — via a toggle — whether the logo should be applied onto the character when generating a character sheet. If the toggle is off, generation behaves exactly as today (no logo).

## UI changes — `src/modules/generator-ui/components/CharacterSheetDialog.tsx`

1. **Logo state**: add `logoUrl` (signed/display URL), `logoSendUrl` (storage public URL passed to the backend), `logoUploading`, and `applyLogo` (boolean toggle, default off).
2. **Logo upload control**: below the model selector, add a compact "Company logo (optional)" row:
   - A small logo thumbnail preview + "Upload logo" button (reuses the same upload pattern as `handleSelected`, uploading into the `user-images` bucket; we don't need a `generator_user_images` row for the logo — it's transient). Accept PNG/JPG/WEBP up to 10 MB.
   - An "×/Remove" control to clear the logo.
   - A toggle/checkbox **"Apply logo to character"** (only enabled when a logo is uploaded). When no logo is present, the toggle is hidden/disabled.
3. **Pass to backend**: in `handleGenerateSheet`, include `logoUrl: logoSendUrl` and `applyLogo` in the invoke body **only when** `applyLogo` is true and a logo exists.
4. Reset logo state when the dialog closes.

## Backend changes — `supabase/functions/generate-character-sheet/index.ts`

1. Parse `logoUrl` (string) and `applyLogo` (boolean) from the body. Validate `logoUrl` with the existing `isAllowedImageUrl` guard.
2. When `applyLogo === true` and a valid `logoUrl` is provided:
   - Fetch the logo and convert to a data URL (same path as the source image).
   - Add it as a **second `image_url` block** in the gateway message.
   - Extend the instruction: tell the model the second image is the company logo and to place it tastefully on the character (e.g. on the shirt/jersey/cap) consistently across all turnaround views, while keeping identity unchanged. Override the existing "no logos" sentence in this branch so it doesn't contradict.
3. When `applyLogo` is false or no logo: keep the current behavior and the current instruction (including "no logos") unchanged.

## Verification

- Redeploy `generate-character-sheet`.
- Build passes.
- Generate a sheet with logo toggle OFF → unchanged result, no logo.
- Generate with a logo uploaded and toggle ON → the character sheet shows the logo applied to the character.
