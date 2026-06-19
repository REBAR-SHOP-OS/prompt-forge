## Goal

Replace the current **two** download controls on each Final Film row (the download arrow + the separate small `MP4` badge button) with a **single download icon**. Clicking it opens a small menu listing the available formats; picking one downloads the video in that format.

## Current state

Each final-film row renders two buttons side by side:
- A download arrow → `downloadDirect()` (fast, original file as stored — usually WebM/MP4)
- An `MP4` text badge → `downloadAsMp4()` (transcodes WebM → broadly-compatible MP4)

This exists in two places with identical markup:
- The **Library → Final videos** row (the one circled in the screenshot)
- The **workspace "Pending" film** row

## Change

In both places, collapse the two buttons into one `DropdownMenu` (already imported in this file):

- **Trigger:** a single round download icon (`Download`, shows the `LoaderCircle` spinner while `downloadingId === <id>`), same styling as today's download button.
- **Menu content** (shown on click, before any download happens):
  - A small label: "Download as"
  - **MP4 (compatible)** → calls `downloadAsMp4(id, storage_path, prefix)` — transcodes to standard MP4 for QuickTime / mobile / players.
  - **Original (fast)** → calls `downloadDirect(id, storage_path, prefix)` — fastest, hands over the stored file via a signed download URL.

Selecting an item triggers that format's existing download function. No download starts until the user picks a format.

The underlying `downloadAsMp4` and `downloadDirect` functions are unchanged — only the UI that invokes them changes.

## Out of scope
- No change to transcode logic, storage, or which formats are technically producible (MP4 + original remain the two real options the app supports).
- No backend changes.

## Technical notes
- File: `src/modules/generator-ui/pages/DashboardPage.tsx`.
- Library row: the `<>...</>` block at ~lines 9402–9436.
- Workspace pending row: the equivalent two-button block at ~lines 7650–7685.
- Reuse `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuLabel` (already imported).
- Keep `event.stopPropagation()` so opening the menu / clicking an item does not trigger the row's click handler.
- Disable the trigger while `downloadingId === <id>` to prevent concurrent downloads.