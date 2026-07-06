## Goal
Make every visible string in the app English-only. Remove bilingual (English/Persian) labels, drop non-English language options from all selectors, and collapse multi-language dictionaries to English-only.

## Files to change

### 1. `src/components/auth/AuthForm.tsx`
- Remove Persian suffixes from 3 bilingual strings (info message, resend button label, confirmation toast).
- Keep English text only.

### 2. `src/modules/generator-ui/pages/DashboardPage.tsx`
- Change composer textarea placeholder from Persian back to English (`"What do you want to forge?"`).
- Remove `fa` and `ar` entries from the language dropdown list (line ~1186), keep English only.
- Change the "تصویر در دسترس نیست" fallback to English.

### 3. `src/modules/generator-ui/components/VoiceoverDialog.tsx`
- Remove `fa` and `ar` from `TRANSLATE_LANGS` dropdown list (keep en + other Latins).

### 4. `src/modules/generator-ui/components/ScenarioWriterDialog.tsx`
- Remove `fa`, `ar`, `tr`, `es`, `fr` from `LANG_OPTIONS`.
- Delete non-English blocks from the `T` localization dictionary; keep only `en`.
- Remove RTL support references where they only served Persian/Arabic.

### 5. `src/modules/generator-ui/components/ProductAdDialog.tsx`
- Same as ScenarioWriterDialog: drop non-English languages from `LANG_OPTIONS` and the `Loc` dictionary.
- Keep only English labels for SELECT, camera styles, scenes, etc.

### 6. `src/modules/generator-ui/components/NarrationDialog.tsx`
- Keep non-English `NARRATION_LABELS` and speaker/says verbs in code **only** (they are needed to parse AI-generated text that may still contain them), but do not expose them in the UI.
- Remove `fa` and `ar` from `TRANSLATE_LANGS` UI dropdown.
- Delete non-English blocks from `UI_STRINGS`; keep only `en`.

### 7. `src/modules/generator-ui/components/CalendarInfoDialog.tsx`
- Delete the `fa` label block; keep only `en`.
- Hardcode `lang` to `'en'`, remove the EN/فا toggle button.
- Update `longLabel` and `monthLabel` to always use `en-US`.
- Remove Persian conditional in `generateScenario` seed text.

### 8. `src/modules/generator-ui/components/AiImageDialog.tsx`
- Remove `faLabel` from `ThemeOption` type and `THEME_OPTIONS` array; display `enLabel` only.
- Remove `fa` and `ar` from `GUARDIAN_LANGS` dropdown.

### 9. `supabase/functions/scenario-write/index.ts`
- Remove `fa`, `ar`, `tr`, `es`, `fr` from `ALLOWED_LANGS` array so the backend defaults to English when no valid lang is sent.

### 10. `supabase/functions/day-info/index.ts`
- Remove `fa` from the `lang` union type and the Persian conditional branches in prompts.

## What stays untouched
- `src/modules/generator-ui/lib/narration.ts` — Persian/Arabic/Turkish/Spanish narration labels and speaker verbs are **parser tokens**, not UI text. Removing them would break narration extraction from existing AI output. They remain in code.

## Validation
- Run `bun run tsc --noEmit` and `bun run build` to confirm no type errors.
- Spot-check the preview to verify no Persian text remains in placeholders, buttons, or dropdowns.