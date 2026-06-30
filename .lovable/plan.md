## Goal
Add a "Guardian" (نگهبان) icon to the **Generate image with AI** dialog that inspects the on-image text: extracts it, shows it to the user, lets them translate it, and judges whether it is appropriate — advertising-style and suitable for a cover.

## What the user gets
A new shield icon button (🛡️) appears in the generated-image action row (next to Download / Regenerate). Clicking it:
1. Reads any text baked into the current generated image (OCR via a vision model).
2. Shows the extracted text in a small results panel inside the dialog.
3. Offers a **Translate** control (target language dropdown, default Persian) using the existing translation backend, shown alongside the original text (original always preserved).
4. Shows a verdict: whether the text is **appropriate** and **cover/ad-suitable**, with a short reason and concrete suggestions — flagging factual/performance claims, guarantees/warranty wording, or anything not promotional.

## Backend
Create one new edge function `inspect-cover-text`:
- Input: the current image as a base64 data URL.
- Uses the Lovable AI Gateway vision model (`google/gemini-2.5-flash`) to:
  - OCR all visible on-image text (returned verbatim, plus a note if no text found).
  - Evaluate it against cover/ad guardrails (must be promotional, brand/mood-driven, no claims like "best/#1/certified", no specs-as-fact, no guarantee/warranty wording).
- Returns structured JSON: `{ text, hasText, language, isAppropriate, isAdSuitable, reason, suggestions[] }`.
- Same auth + 429/402 error handling pattern as `write-image-prompt`.

Reuse the existing `translate-text` function for the translation feature — no backend change needed there.

## Frontend (`AiImageDialog.tsx`)
- Add a `Shield`/`ShieldCheck` lucide icon button in the action row, enabled only when a generated image exists.
- Add state for: inspection loading, inspection result, translation target language, translated text, translation loading.
- On click → call `inspect-cover-text` with `imageDataUrl`; render a panel with:
  - Extracted original text (read-only, selectable).
  - Verdict badges (Appropriate / Ad-suitable) in green/amber/red + reason + suggestion bullets.
  - A language selector + **Translate** button that calls `translate-text`; show the translation under the original without replacing it.
- Reuse existing dialog styling (rounded panels, RTL handling consistent with current dialogs). All UI labels in English to match existing convention.

## Technical notes
- The generated image is already in memory as `imageDataUrl` (base64), so OCR needs no storage round-trip.
- No changes to generation, save/Use, masking, or theme logic.
- Translation languages reuse the set already supported by `translate-text` (fa, en, ar, tr, es, fr, de, ru, zh).
