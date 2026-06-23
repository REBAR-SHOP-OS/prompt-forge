# Translate the entire Narration dialog

When the user picks a language in the selector (circled in the screenshot), only the "From prompt" block is translated today. The user wants **every text block** in the dialog translated into the chosen language.

## What gets translated

When a language is selected:
1. **From prompt** narration → already translated (keep).
2. **On film** transcript → translate the recognized film speech.
3. **Check** section → translate the status message, the "missing on film" and "extra/wrong on film" word lists, and the "possible pronunciation issues" line.
4. **Static UI labels** (`From prompt`, `On film`, `Check`, `Read aloud`, `Word-by-word diff`, button titles, helper sentences) → switched using a small built-in dictionary, so fixed strings cost nothing and stay instant.

Selecting **Original** restores all original text everywhere.

## How it works

In `src/modules/generator-ui/components/NarrationDialog.tsx`:

- Keep one shared `targetLang` state driving the whole panel.
- Add translation state for the transcript and the check message:
  - `transcriptTranslation`, `checkMessageTranslation` (plus translating flags).
- When `translateNarration(lang)` runs, fan out parallel `translate-text` calls for: prompt text (existing), the current transcript (if present), and the check message (if present). Cache results per `text+lang` in a `useRef` map so re-selecting a language is instant and avoids extra AI cost.
- Render the translated text under each section when a translation exists (mirroring the existing sky-colored translation block used for the prompt), keeping the original above for reference.
- Static labels read from a `UI_STRINGS[lang]` dictionary with English fallback; RTL handled by existing `dir="auto"`.
- If transcription happens *after* a language is already chosen, automatically translate the new transcript too (effect keyed on `transcript` + `targetLang`).

## Technical details

- Reuse the existing `translate-text` edge function and `supabase.functions.invoke` pattern — no backend changes.
- Word-by-word diff stays in the original language (it is a literal prompt-vs-film comparison and must not be altered); only the human-readable summary lines around it are translated.
- "Read aloud" continues to read the translation when one is active.
- Verify in the preview: pick فارسی and confirm prompt, transcript, and check message all show translated text; pick Original and confirm everything reverts.

## Files

- `src/modules/generator-ui/components/NarrationDialog.tsx` (translation fan-out, state, render, label dictionary)

No database or edge-function changes.