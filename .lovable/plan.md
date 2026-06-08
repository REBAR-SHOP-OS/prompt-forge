## Goal

Expand the Product Ad Scenario dialog from a 2-language (English/Persian) toggle to a **6-language** selector — adding **Arabic, Turkish, Spanish, French** alongside the existing English & Persian — and translate **everything**: UI strings plus all option labels (camera styles, genres, scenes, video templates and their group headers). Replace the single toggle button with a **dropdown** language picker.

All changes are confined to `src/modules/generator-ui/components/ProductAdDialog.tsx`. No backend/prompt logic changes — the scenario request still sends English `prompt` values to the AI; only the displayed text changes.

## Language model

- Extend the `Lang` type: `'en' | 'fa' | 'ar' | 'tr' | 'es' | 'fr'`.
- RTL handling: `dir = (lang === 'fa' || lang === 'ar') ? 'rtl' : 'ltr'`.

## Data label refactor

The current data arrays store labels as flat `label` + `labelFa` fields, with JSX doing `lang === 'fa' ? labelFa : label`. Adding four more languages this way is unmanageable. I'll refactor each translatable label to a localized map and add a tiny helper.

- Add a helper:
  ```ts
  type Loc = Partial<Record<Lang, string>> & { en: string }
  const tr = (m: Loc, lang: Lang) => m[lang] ?? m.en
  ```
- Convert label/group fields on `CAMERA_STYLES`, `GENRE_TEMPLATES`, `SCENE_TEMPLATES`, and `VIDEO_TEMPLATES` from `label`/`labelFa` (+ `group`/`groupFa`) into:
  - `label: Loc` (en/fa/ar/tr/es/fr)
  - `group: Loc` for scenes and video templates (the English `group` string also stays as a stable grouping key, so grouping logic keys off `group.en`).
- The stable `id` and English `prompt` stay exactly as-is (selection state and the AI request keep using `id`/`label.en`/`prompt`).
- Update `SCENE_GROUPS`/`VIDEO_GROUPS` and the group-name lookups to use `group.en` as the key and `tr(group, lang)` for display.

## UI strings (`T`)

Extend the `T` object with full translations for all ~24 keys in `ar`, `tr`, `es`, `fr` (title, description, photo, productName + placeholder, description label/placeholder, yourPrompt + placeholder, duration, cameraStyle, genre, scene, videoTemplates, cameraNotes + placeholder, adScenario, scene_, copy, copyAll, copied, regenerate, sendAll, useAsPrompt, generate). The `translate` key becomes unused (replaced by dropdown) and will be removed.

## Language selector (dropdown)

Replace the single toggle button (lines ~484-493) with a dropdown using the existing `@/components/ui/select` (or `dropdown-menu`) component already in the project:

- Trigger: compact pill showing the `Languages` icon + current language's native name.
- Options (native names): English, فارسی, العربية, Türkçe, Español, Français.
- Selecting an option calls `setLang(value)`.

## JSX updates

Replace every `lang === 'fa' ? x.labelFa : x.label` and group ternary with `tr(x.label, lang)` / `tr(x.group, lang)`. Keep `dir` applied on `DialogContent`.

## Technical notes

- Single file edit: `src/modules/generator-ui/components/ProductAdDialog.tsx`.
- Translations authored for UI strings and every option label/group across the four new languages.
- Selection comparisons that currently use `style.label` will switch to comparing against `style.label.en` (and similarly `CAMERA_STYLES[0].label.en` for the default), so state values stay language-independent.
