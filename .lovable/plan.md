## Goal

Remove the "GPT-OSS 20B / planner LLM" selector button (the circled icon) from the prompt composer. It isn't needed.

## Change

In `src/modules/generator-ui/pages/DashboardPage.tsx`:

- Remove the planner `<Popover>` button block (lines ~7908–7953) that renders the planner selector (`selectedPlanner.label`).

To keep the file clean and avoid unused-code/build issues, also remove the now-unused planner support code:
- `planPromptWithLocalLlm` function (lines ~2280–2328) and any call sites that use it.
- Planner state: `isPlannerMenuOpen`, `selectedPlannerId`, `selectedPlanner`, related `useEffect`/localStorage (lines ~2181–2212).
- `PlannerChoice` type and `PLANNER_CHOICES` array (lines ~251–283).

## Notes

Generation will simply use the prompt as typed (which is what "No planner" already did by default), so behavior is unchanged for the default case. The local-llm edge function is left in place but no longer called from the UI.
