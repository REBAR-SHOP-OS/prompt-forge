## Goal
Let the user translate the **Copyright check** dialog content into their own language so they can read the verdict, summary, and risk explanations accurately.

## What changes
Add a small **language selector** at the top of the Copyright check dialog (in `src/modules/generator-ui/pages/DashboardPage.tsx`). Default option is **Original** (English, unchanged). Choosing a language (Persian, Arabic, English, Turkish, Spanish, French, German) translates all the dialog's text in place:
- Overall verdict summary
- Video section reason + risk bullets
- Music & voiceover section reason + risk bullets

The status labels (Approved / Rejected / Caution) and colors stay as visual indicators; only the human-readable explanation text gets translated.

## How it works
- Reuse the existing `translate-text` edge function (already deployed, no backend change needed). It accepts `{ text, targetLang }` and returns `{ translation }`.
- When a language is selected, gather every text field from `copyrightResult` into one batched request (joined with a unique separator), send it to `translate-text`, then split the result back into the matching fields and render the translated version.
- Translations are cached per language in component state so re-selecting a language is instant and costs nothing.
- RTL languages (Persian, Arabic) render with `dir="rtl"`.
- A small spinner shows while translating; on error the dialog falls back to the original text with a retry.

## Scope
- Frontend-only change in `DashboardPage.tsx` (dialog UI + a couple of state hooks).
- No database, auth, storage, or generation-logic changes.
- No new edge function — reuses `translate-text`.

## Technical notes
- New state: `copyrightLang` (selected language) and `copyrightTranslations` (cache map keyed by language → translated CopyrightResult).
- A helper builds a flat ordered list of strings from `CopyrightResult`, sends them as one delimited payload, and reconstructs the translated object so bullet order is preserved.
- Reset translation state to "Original" whenever the dialog opens a new film or a fresh check runs.
