## Goal
In the Voiceover dialog, translation should be **informational only**. The original (main) text must stay in the TEXT field and remain what's used for the voiceover. The translation is shown separately as a read-only reference.

## Current behavior (problem)
`handleTranslate()` calls `setText(translation)` — this **overwrites** the original text, so the source text is lost and the main text is no longer displayed.

## Planned changes (file: `src/modules/generator-ui/components/VoiceoverDialog.tsx`)

1. **Add a separate translation state**
   - New state `const [translation, setTranslation] = useState<string | null>(null)` and `const [translationLang, setTranslationLang] = useState<string | null>(null)`.

2. **Stop overwriting the original text**
   - In `handleTranslate()`, replace `setText(translation)` with `setTranslation(translationResult)` + store the target language label. The TEXT field keeps the original untouched.
   - Keep `setTone('advertising')` and the success toast.

3. **Display the translation as a read-only reference panel**
   - Below the TEXT textarea (after the toolbar row, before the Gender/Tone grid), conditionally render a small bordered, muted panel when `translation` is set:
     - A label like “Translation ({language}) — reference only”.
     - The translated text shown read-only (not editable, not used for TTS).
     - A small ✕ button to dismiss/clear the translation reference.
   - Use existing semantic styling (muted zinc tones, `text-[11px]`, dashed/subtle border) consistent with the dialog.

4. **Clear translation when appropriate**
   - Reset `translation`/`translationLang` to null when the user edits the original text (in the textarea `onChange`) and when a new narration is generated, so the reference never goes stale.

## Result
- TEXT box always shows and keeps the original text (the “main text”), which is what the voiceover is generated from.
- The translation appears underneath purely for awareness, and can be dismissed.

## Note
No backend/edge-function changes are needed — the `translate-text` function still returns the translation; only how the result is presented in the UI changes.