# Add translation to the Copyright check dialog

## Goal
The Copyright check result is shown only in English (summary, video/music reasons and risk bullets). Add a translate control so the user can read the full review accurately in their own language — Persian by default — while keeping the original English text intact.

## What the user will see
- A small "Translate" control (language picker + button) added to the top of the Copyright check dialog, next to the description.
- After choosing a language and clicking translate, every text part of the result (overall summary, Video reason + risks, Music & voiceover reason + risks) is replaced/augmented with the translated version.
- The original English stays available (a "Show original / نمایش متن اصلی" toggle), matching the existing translation pattern used in the Voiceover/Narration dialogs (translation is for reference, original is preserved).
- For RTL languages (Persian, Arabic) the translated text blocks render right-aligned with `dir="rtl"`.

## How it works (technical)
- Reuse the existing `translate-text` edge function (already supports fa/en/ar/tr/es/fr/de/ru/zh, 5000-char limit, returns `{ translation }`). No backend changes needed.
- In `src/modules/generator-ui/pages/DashboardPage.tsx`, in the Copyright dialog block (around lines 12771–12863):
  - Add local state: `copyrightLang`, `copyrightTranslating`, `copyrightTranslated` (a structured object mirroring `CopyrightResult`: summary, video.reason, video.risks[], music.reason, music.risks[]), and `showOriginal`.
  - Add a language `Select` + Translate button in the dialog header area, reusing the `TRANSLATE_LANGS` list/labels already used in `VoiceoverDialog.tsx` (extract to a shared constant or duplicate the small array).
  - On translate: serialize the result's text fields into one delimited string, call `supabase.functions.invoke('translate-text', { body: { text, targetLang, style: 'plain' } })`, then split the response back into the structured fields. Using a single call keeps it within the char limit and avoids many round-trips; fall back to per-field calls only if parsing fails.
  - The `Section` and overall summary rendering reads from `copyrightTranslated` when a translation exists and `showOriginal` is false; otherwise from `copyrightResult`. Status labels/icons (Approved/Rejected/Caution) stay as-is since they're UI state, not prose.
  - Reset the translation state whenever the dialog closes or a new check runs (in the existing `onOpenChange` cleanup and `runCopyrightCheck`).
- Show a small spinner on the button while translating and a toast on success/error, consistent with existing dialogs.

## Out of scope
- No changes to the copyright analysis itself or the `copyright-check` edge function.
- No changes to auth, storage, or other dialogs.
