Bug
---
In the preview area of `src/modules/generator-ui/pages/DashboardPage.tsx`, the editable contact-overlay CSS layer (around line 9032, gated by `contactActive`) is rendered on top of ANY previewed video — including the Final Film. The Final Film already has the contact info/logo permanently burned in during merge (`mergeVideos.ts`). The result is the overlay showing twice: once burned-in (bottom) and once as the live editable layer (the circled middle one in the screenshot).

The editable live overlay is only meaningful while positioning on a single source card before rendering. It must NOT appear when the preview is the merged Final Film (or a Library merged project, which is also already burned in).

Fix
---
1. Add a derived flag that detects when the current preview is a merged/final film, e.g.:
   - `previewItem.kind === 'video'` AND
   - (`previewItem.job.id === '__final_film_preview__'` OR `previewItem.job.provider_key === 'merged'` OR the preview is the selected Library project `selectedProjectId`).

2. Gate the live contact overlay block (line 9032 `contactActive ? ...`) so it only renders when this is NOT a final/merged film. The burned-in version stays untouched in the rendered video.

Result
------
- Final Film / Library merged projects: only the burned-in overlay is visible (no duplicate floating layer).
- Single source card preview: the editable, draggable overlay still works exactly as before.