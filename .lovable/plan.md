## Goal

Fix the "Add character" chip in the prompt bar (`DashboardPage.tsx`, ~lines 10212–10233). When a character is selected it currently shows the raw filename (e.g. `ai-9b8d1a95-…— sheet`), which looks broken. Replace the filename with a clean generic label and add an inline remove (×) control directly on the chip.

## Changes (UI only, in `src/modules/generator-ui/pages/DashboardPage.tsx`)

1. **Stop showing the image filename**: when a character is selected, render the avatar thumbnail + a short fixed label `"Character"` instead of `selectedCharacter.title`. (The long generated name is never shown.)

2. **Inline remove on the chip**: add a small `×` button at the end of the chip (only when a character is selected) that clears the selection (`setSelectedCharacter(null)`), without opening the popover. It needs `e.stopPropagation()` / `e.preventDefault()` so clicking × doesn't toggle the popover trigger, and an `aria-label="Remove character"`.

3. Keep the existing popover (picker + its "Remove" link) intact; this just adds the quick inline remove and hides the filename. The chip stays the same pill style, only the text and the added × change.

## Technical detail

- The trigger is a single `<button>` wrapping the avatar + label. To host an interactive × inside it (nested buttons are invalid), restructure the trigger content so the × is a clickable `<span role="button">` (or convert the chip container to a non-button element with the avatar/label as the popover trigger). Simplest: keep the chip as the trigger and render the × as a `span` with an `onClick` that stops propagation and clears selection.

## Verification

- Build passes.
- With a character selected, the chip shows the avatar + "Character" (no long ID) and an × that removes it in one click.
- With no character, it still shows the `UserRound` icon + "Add character" and opens the picker.
