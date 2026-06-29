## Problem

When no character is added in the composer, a character can still be baked into the video. The user removes the character (or never adds one), yet the AI still injects a character into the clip.

## Root cause

`projectCharacter` is derived as:

```text
projectCharacter = selectedCharacter ?? continuity.characterRef ?? null
```

The "Add character" button and its Remove (X) actions only call `setSelectedCharacter(null)`. They never clear `continuity.characterRef`. So after removing a character, `selectedCharacter` is `null` but `continuity.characterRef` still holds the old reference. `projectCharacter` falls back to it, and the generation paths (`extractCharacterStartFrame`, `applyCharacterPrefix`, forced Image-to-Video) keep using a character that is no longer added.

## Fix (frontend / presentation only)

In `src/modules/generator-ui/pages/DashboardPage.tsx`, make "no character added" truly mean "no character used":

1. **Clear the persisted anchor on every remove path.** Update the three places that currently do only `setSelectedCharacter(null)` to also call `updateContinuity({ characterRef: null })`:
   - The chip's inline Remove (X) button (~line 12123–12133)
   - The popover header "Remove" button (~line 12154)
   These already exist; adding the continuity clear ensures the character is dropped from the project anchor, not just the local selection.

2. **No behavior change when a character IS added** — selecting a character still sets both `selectedCharacter` and `continuity.characterRef` (line 12175), so consistency/anchoring across cards is preserved exactly as today.

This keeps `projectCharacter` and `continuityCharacterRef` empty whenever the user has not added a character, so none of the character-injection branches (start-frame extraction, character prefix, forced I2V) run.

## Verification

- Add a character → confirm it still bakes/anchors across scenes (unchanged).
- Remove the character (X or Remove) → confirm `projectCharacter` becomes null and no character start frame / prefix is applied on submit.
- Reload project after removing → character stays removed (continuity anchor cleared and persisted).