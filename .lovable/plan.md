## Goal
In the Character Sheet dialog: (1) let the user zoom/enlarge a generated image to inspect it, and (2) add a "Use as character" action that sends the selected image to the composer's **Add character** slot and makes it the active project character.

## Changes

### 1. `CharacterSheetDialog.tsx` — zoom + use-as-character
- Add a **zoom lightbox**: a `zoomUrl` state. Each image card gets a maximize button (and clicking the image) opens a full-size preview overlay (nested `Dialog`) showing the image large with a close button.
- Add a **"Use as character"** button on each card (next to "Make sheet"). Clicking it:
  - calls a new optional prop `onUseCharacter({ id, url, title })`
  - closes the Character Sheet dialog.
- Add prop: `onUseCharacter?: (c: { id: string; url: string; title: string | null }) => void`.

### 2. `DashboardPage.tsx` — wire the selection
- Pass `onUseCharacter` to `<CharacterSheetDialog>`. The handler:
  - builds a `ProjectCharacter` from the image,
  - sets it as `selectedCharacter`,
  - inserts it into `characterList` if not already present (so the Add-character popover shows it),
  - closes the Character Sheet (`setIsCharacterSheetOpen(false)`).

## Result
- Clicking an image (or its zoom button) opens a large preview.
- Clicking "Use as character" closes the sheet and fills the **Add character** button with that image — it becomes the project character reference used in generation.

## Notes
- Uses the already-signed `storage_path` URL each image carries, so no extra signing needed.
- No backend or generation-logic changes; UI/state wiring only.