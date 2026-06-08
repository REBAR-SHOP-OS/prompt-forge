## Goal

When the user clicks the **MUSIC** button (top toolbar), show a small dropdown with two options instead of immediately opening the file picker:

1. **آپلود موزیک از کامپیوتر** (Upload music from computer) → opens the file picker (existing `musicFileInputRef`).
2. **جستجوی موزیک** (Search music) → opens `https://pixabay.com/` in a new browser tab.

## Where

`src/modules/generator-ui/pages/DashboardPage.tsx`

The MUSIC button currently calls `handleMusicButtonClick()` (line ~4500), which either opens the edit dialog (when a track is already loaded) or directly triggers the hidden file input.

## Changes

1. Wrap the MUSIC `<button>` (around line 6086) in a `DropdownMenu` (shadcn `@/components/ui/dropdown-menu`, already in the project) so clicking it opens a menu.
   - Keep the existing button styling/label/state (including the loaded-track chip with remove "X").
   - To avoid conflict with the existing chip's nested remove button and the "edit when loaded" behavior:
     - **When a track is already loaded** (`musicUrl` set): keep current behavior — clicking opens the edit dialog directly (no dropdown), so the inline remove "X" keeps working.
     - **When no track is loaded**: clicking opens the dropdown with the two options.

2. Dropdown items:
   - "Upload music from computer" → `musicFileInputRef.current?.click()` (reuses existing file input + `handleMusicFileChange`, which already persists to Storage › Audio).
   - "Search music" → `window.open('https://pixabay.com/', '_blank', 'noopener,noreferrer')`.

3. Remove/replace the no-track branch of `handleMusicButtonClick` since the dropdown now drives those actions (the upload action moves into the menu item).

No backend, schema, or business-logic changes — purely a UI affordance on the existing button.

## Verification

- With no soundtrack: click MUSIC → dropdown shows two items. "Upload..." opens file picker; "Search music" opens Pixabay in a new tab.
- With a soundtrack loaded: button still shows the track chip, opens the edit dialog, and the inline remove "X" still works.