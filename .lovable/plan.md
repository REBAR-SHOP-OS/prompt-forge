## Goal

In the Calendar dialog, when the user clicks any occasion (in the day list or the month list), a new right-hand column generates an AI film-scenario prompt for that specific occasion. The user reviews it, presses "Use in prompt", and the scenario is inserted into the main chat box (`promptText`) and the clip duration is forced to 10 seconds. The Calendar dialog then closes.

## UX

Calendar dialog grid changes from 3 columns to 4 columns:
1. Calendar (unchanged)
2. Day details (unchanged) — clicking an occasion title here also selects it for the new column
3. This-month list (unchanged) — clicking an occasion here also selects it for the new column
4. **NEW: "Scenario" column** showing:
   - Selected occasion title (or empty placeholder "Pick an occasion to generate a 10s film scenario")
   - Loading spinner while AI generates
   - Generated scenario text (read-only, scrollable, language follows current `lang` toggle)
   - Two buttons: **Regenerate** and **Use in prompt** (primary)
   - Small "10s" badge to signal the duration the scenario targets

## Behavior

- Clicking any occasion (day or month) sets a `selectedOccasion` state and triggers generation.
- Generation reuses the existing `enhance-prompt` edge function with:
  - `prompt`: a seed like `"Cinematic 10-second scene about: <title>. <whatItIs>"` (Persian seed when `lang==='fa'`)
  - `mode`: `"silent"` (no narration) — keeps it visual-only and ≤ ~80 words, which fits a 10s clip
- Cache results by `occasion.title + lang` to avoid re-calling the API.
- "Use in prompt" calls a new prop `onApplyPrompt(scenario: string)` and closes the dialog.
- DashboardPage handler:
  - `setPromptText(scenario)`
  - `setDurationSeconds(10)`
  - `setIsCalendarOpen(false)`

## Files to change

- `src/modules/generator-ui/components/CalendarInfoDialog.tsx`
  - Add `onApplyPrompt?: (prompt: string) => void` to props
  - Add state: `selectedOccasion`, `scenarioCache`, `scenarioLoading`, `scenarioError`
  - Change grid to `md:grid-cols-[auto,1fr,1fr,1fr]`
  - Render the new Scenario column
  - Make occasion buttons in columns 2 & 3 also call `setSelectedOccasion`
  - Add `generateScenario()` using `supabase.functions.invoke('enhance-prompt', { body: { prompt: seed, mode: 'silent' } })`
  - Add labels in `labels.en` / `labels.fa` for: scenarioTitle, pickOccasion, regenerate, useInPrompt, generating, badge10s

- `src/modules/generator-ui/pages/DashboardPage.tsx`
  - Pass `onApplyPrompt={(p) => { setPromptText(p); setDurationSeconds(10); setIsCalendarOpen(false); }}` to `<CalendarInfoDialog />`

## Out of scope

- No backend / edge function changes (reuses `enhance-prompt`).
- No change to chat submit flow — user still presses the existing send button after the prompt is filled in.
- No change to Final Film, Library, or other dashboard state.
