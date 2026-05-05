# Show every generated video as a card in the right "Generated" panel

Currently the right-side column ("Generated / Approved outputs") only lists videos that the user has explicitly approved. The user wants every successfully generated video to appear there automatically as a card (matching the three rectangles drawn on the screenshot), so they can preview, approve, edit/continue, or delete each one directly from that column.

The existing left slide-in panel already shows all generated videos — so this change effectively promotes that list into the always-visible right column.

## Change

In `src/modules/generator-ui/pages/DashboardPage.tsx`, the right `<aside>` (currently rendering `approvedVideos`) will instead render `completedVideos`:

- **List source**: switch the rendered array from `approvedVideos` → `completedVideos`, including the count badge in the header and the empty-state guard.
- **Empty-state copy**: "No approved videos yet." → "No videos generated yet."
- **Sub-header copy**: "Approved videos / Approved outputs" → "All generated videos / Outputs" (so it reflects the new meaning).
- **Bookmark button per card**: become a true toggle. When the video is approved, show `BookmarkCheck` in emerald with title "Remove approval"; when not approved, show `BookmarkPlus` with title "Approve video". Uses the existing `approvedIds` set + `toggleApproved` handler.
- **Edit-and-continue button per card**: select the card first (`setPreviewVideoId(video.id)`) and then call `editAndReusePreviousClip` on the next tick, so the action targets the clicked card instead of whatever was previously in preview.
- **Delete button**: unchanged (already calls `deleteCard(video.id)`).

The existing left slide-in panel (opened from the modules menu → "Generated videos") stays as-is — it now duplicates the same list, which is harmless. Out of scope for this task; can be removed later if the user wants.

## Files edited

- `src/modules/generator-ui/pages/DashboardPage.tsx` (single block in the right `<aside>`, ~lines 1280–1397)
