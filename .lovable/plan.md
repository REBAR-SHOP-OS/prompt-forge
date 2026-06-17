## Goal
When uploading product photos, each item should automatically get its name from the source file name (instead of "Untitled"). The existing rename/edit capability stays exactly as it is, so the user can still change it.

## Change
In `src/modules/generator-ui/pages/DashboardPage.tsx`, inside `handleProductPhotoSelected`:

- For each uploaded file, derive a default title from `file.name` with the extension stripped (e.g. `mesh-roll.png` → `mesh-roll`).
- Use the optional "Product name" field as an override when the user typed one; otherwise fall back to the per-file derived name.
- Save that value into the `title` column on insert (replacing the current `trimmedName || null`).

So:
- If the user typed a name in the "Product name (optional)" field → all files in the batch use that name (current behavior preserved as an explicit override).
- If the field is empty → each file gets its own file-name-based title instead of `null` (which currently renders as "Untitled").

## Editing
No change needed — `renameProductPhoto` / the inline rename input (around lines 6960–7010) already lets the user click and edit the name. Since titles will now be non-null, they render in normal (non-italic) style, and remain fully editable.

## Notes
- Pure frontend/presentation change in the upload handler; no schema or backend changes.
- Title still trimmed/capped at 100 chars.
