# Ask for styles before writing the product scenario

## Goal
Right now clicking **"Scenario for this product"** writes the scenario immediately using whatever styles happen to be selected. The user wants it to first ask which styles to apply, then write the scenario.

## Behavior change
Clicking **"Scenario for this product"** will expand an inline style picker (the same camera / genre / scene / template options used elsewhere) directly under the menu item. The user picks the styles they want (optional), then clicks a **"Write scenario"** button to generate. Styles stay optional — they can skip and write right away.

```text
Prompt menu
 ├─ No narrator
 ├─ With narrator
 ├─ Scenario for this product   ← click expands ↓
 │    [ Camera / Genre / Scene / Template style chips ]
 │    [ Clear ]              [ Write scenario ]
 └─ Styles
```

## Technical details (`src/modules/generator-ui/pages/DashboardPage.tsx`)
1. Add a new UI state `scenarioMode: 'idle' | 'input'` (mirrors existing `styleMode`/`narratorMode`).
2. Change the "Scenario for this product" button's `onClick` from `void runProductScenario()` to toggling `scenarioMode` (only when a product is pinned; keep the disabled/empty-state hint when none is pinned).
3. Below that button, when `scenarioMode === 'input'`, render:
   - The same `StyleSection` list (Camera, Genre, Scene groups, Template groups) bound to the existing `selectedStyles` / `toggleStyle` state — reusing the exact markup already used by the Styles section.
   - A footer row with **Clear** (`setSelectedStyles(emptyStyleSelection())`) and **Write scenario** (`void runProductScenario()` + collapse the menu), with the existing loading spinner state.
4. `runProductScenario()` already reads `selectedStyles` via `buildStyleHints`, so no logic change is needed there — it will now use whatever the user picked in this step.
5. Widen the popover for `scenarioMode === 'input'` the same way it already widens for `styleMode === 'input'`, and reset `scenarioMode` to `'idle'` when the menu closes / after a successful run.

No backend, edge function, or business-logic changes — this is purely the prompt-menu UI flow.