# Library cards: keep only Download + Delete

In the **left Library panel** (Your library), each saved video card currently shows four icons in the action row: Download, X (remove from library), Pencil (edit prompt & regenerate), Trash (delete). Reduce that to two icons: **Download** and **Delete**.

When Delete is pressed, the video is permanently removed (storage file + DB row when applicable). This already works in the existing `deleteCard` function — no behavior change needed there.

## Changes

`src/modules/generator-ui/pages/DashboardPage.tsx`, inside the Library card render block (around lines 2013–2036):

- Remove the **X** button that calls `toggleApproved(video.id)` ("Remove from library").
- Remove the **Pencil** button that calls `editAndReuseJob(video)` ("Edit prompt and regenerate").

The **Download** anchor and the **Trash** (Delete) button stay exactly as they are. `deleteCard` already:
- Asks for confirmation.
- Removes the file from the `merged-videos` storage bucket for merged entries.
- Calls `jobOrchestratorGateway.deleteJob` to delete DB rows + storage files for real jobs.
- Removes the entry from the in-memory list and clears the preview if it was selected.

So pressing Delete in the Library will fully delete the video, as requested.

## Files touched
- `src/modules/generator-ui/pages/DashboardPage.tsx`
