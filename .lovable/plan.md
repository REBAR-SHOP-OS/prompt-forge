# Scenario relevance + translation

Two goals from the user:
1. The generated scenario/narration must be tightly tied to **both** the user's business AND the selected product (its name + image).
2. Translation must work in **both** dialogs (Scenario Writer + Product Ad). When the user switches the language, the UI of that section translates, and the **generated scenario itself is written in the selected language**.

## 1. Edge function: `supabase/functions/scenario-write/index.ts`

- Accept a new optional `outputLanguage` field in the request body (validated against the allowed set `en, fa, ar, tr, es, fr`; default `en`).
- Replace the hard-coded "in ENGLISH" directives in `buildSystemPrompt` with a language directive driven by `outputLanguage`. When non-English, instruct the model to write the **entire scenario, all narration, and all spoken dialogue in that language** (e.g. Persian/Farsi), while keeping technical camera/lighting cues clear. The `===SCENE===` delimiter and word-count rules stay unchanged.
- Strengthen the relevance constraint: combine business + product into one firm rule — every shot, beat, and spoken line must promote **the user's specific product** (by name, matching the attached image) **within the context of the user's business**, with no drift to unrelated themes. Make `businessLine` reference the product name explicitly when present.

## 2. Scenario Writer dialog: `src/modules/generator-ui/components/ScenarioWriterDialog.tsx`

Currently English-only with no language switcher. Bring it to parity with Product Ad:

- Add a `Lang` type + `lang` state, a `Languages` icon `Select` in the header (same 6 options), and `dir` RTL handling (`fa`, `ar`).
- Add a `T` translation table covering all visible strings (title, description, Duration label, idea label/placeholders, idea-mode toggles, image attach labels, business popover label/placeholder/required tag/Save/Saved, buttons, error fallbacks) in all 6 languages.
- Pass `outputLanguage: lang` in the `scenario-write` invocation so output matches the chosen language.

## 3. Product Ad dialog: `src/modules/generator-ui/components/ProductAdDialog.tsx`

- It already has the full language switcher + `T` tables. Add `outputLanguage: lang` to its `scenario-write` invocation so the generated scenario follows the selected language (today only the UI translates).

## Technical notes

- Allowed language set kept in sync between the two dialogs and the edge function.
- No database or schema changes; business-info persistence and gating stay as-is.
- `google/gemini-2.5-flash` already handles multilingual output, so no model change.

## Verification

- Deploy the edge function, then `curl` it with `outputLanguage: "fa"` plus a sample business + product to confirm the scenario comes back in Persian and on-topic; repeat with `en`.
- Use the preview (Playwright) to switch language in each dialog and confirm labels + RTL flip, then generate and confirm the output language.
