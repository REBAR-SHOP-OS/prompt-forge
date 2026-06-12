## Goal
Add bulk-selection to the Library so users can select multiple **Draft** projects (and likewise multiple **Final video** projects) at once and delete them together, via a "select all" toggle plus per-card checkboxes.

## Where
All changes are in `src/modules/generator-ui/pages/DashboardPage.tsx`, inside the Library aside (Final videos section ~line 8576, Drafts section ~line 8594, and the card renderer `renderCard` ~line 8511–8556). Deletion reuses the existing `deleteCard(jobId)` logic — no backend or business-logic changes.

## Behavior
- Each section header (Final videos / Drafts) gets a small **select icon** (e.g. `CheckSquare`/`ListChecks`) that toggles a "selection mode" for that section.
- In selection mode:
  - Each card in that section shows a checkbox in its corner.
  - A header **"Select all"** toggle selects/deselects every card in that section.
  - A **trash / "Delete selected (N)"** button appears; clicking it asks for one confirmation and deletes all selected cards.
  - An **X / Cancel** exits selection mode and clears the selection.
- Final videos and Drafts have independent selection state, so selecting in one section does not affect the other.

## Technical details
- Add component state:
  - `draftSelectMode: boolean`, `selectedDraftIds: Set<string>`
  - `finalSelectMode: boolean`, `selectedFinalIds: Set<string>`
- In `renderCard(video, variant)`, when the matching section's select mode is on, render a checkbox overlay bound to the matching selection set (toggle add/remove of `video.id`). Clicking a card in select mode toggles its checkbox instead of opening it.
- Header controls per section:
  - Toggle-select-mode icon button.
  - When active: "Select all" button (fills the set with the section's item ids), "Delete (N)" button, and "Cancel".
- Bulk delete handler: a single `window.confirm` (e.g. "Delete N selected drafts permanently?"), then run the existing per-item delete sequentially/`Promise.allSettled` by calling the current `deleteCard` flow logic for each selected id. To avoid N confirm dialogs, factor the confirm out: add an internal `deleteCardConfirmed(jobId)` (current `deleteCard` body without the `window.confirm`) and have both single-delete and bulk-delete call it; `deleteCard` keeps its single confirm.
- Reset each section's select mode + selection when its list becomes empty or after a successful bulk delete.

## Out of scope
No changes to backend, deletion semantics, draft/final data model, or the localStorage/backend sync logic — only UI selection + reusing existing delete.
