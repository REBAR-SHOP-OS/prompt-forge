## Goal

Restructure the dashboard's panels:

1. **Right "Recent outputs" panel** → always visible (static), no open/close, no `X` button. This is the live workbench where in-progress and recent renders show up.
2. **Left "Library" panel** → new panel, slides in from the **left**, opens **only** when the 4-square (`LayoutGrid`) icon at the top-left is clicked. Hidden by default.
3. **Left panel only shows approved videos** → users explicitly "approve" / "send to library" a finished video from the right panel. Only those approved videos appear on the left.

## UX Behavior

- **4-square icon (top-left)**: now toggles the **left** library panel (was previously toggling the right history panel).
- **Right panel** is permanently mounted on the right edge of the screen, no toggle, no close button. The "+" (new render), prompt composer behavior, and progress bars stay exactly as they are.
- **Approve action** on right-panel cards:
  - Appears only when a render is in `completed` status (has a video).
  - A small "Save to library" button (bookmark/check icon) on each completed card.
  - Clicking it adds the job to the user's approved set; clicking again removes it.
  - Approved cards on the right show a subtle "In library" badge so the user knows what's already saved.
- **Left panel** lists only approved videos:
  - Same card layout as the right panel (poster, prompt, date), no progress bar (always completed).
  - Empty state: "No saved videos yet — approve a render from the right to keep it here."
  - Has a close `X` (since this one IS toggleable).
  - Clicking a card sets it as the main preview (same as right panel).

## Persistence

- Approved video IDs are persisted in `localStorage` keyed per user (`approved-videos:<userId>`).
  - Survives reloads, no backend migration needed.
  - Future-proof: if we later want this server-side, the same `approvedIds` set can be backed by a Supabase table without UI changes.

## Technical Changes (single file)

### `src/modules/generator-ui/pages/DashboardPage.tsx`

1. **State**:
   - Rename `isHistoryPanelOpen` → `isApprovedPanelOpen` (governs the LEFT panel).
   - Add `approvedIds: Set<string>` + `toggleApproved(jobId)` helper, persisted via `localStorage` keyed on `session.user.id`.
   - Load approved IDs in a `useEffect` on user change.

2. **4-square button** (top-left):
   - Now toggles `isApprovedPanelOpen` instead of `isHistoryPanelOpen`.
   - `aria-expanded` / labels updated.

3. **Right `<aside>` (Recent outputs)**:
   - Remove `isHistoryPanelOpen` conditional classes — always rendered, fixed to right edge.
   - Remove the `X` close button from its header (keep History label, count, and the `+` add button).
   - On each completed card, add an "Approve / In library" toggle button next to the prompt.

4. **New left `<aside>` (Library / Approved videos)**:
   - Mirrors the right panel's card style.
   - Iterates over `generatedVideos.filter(v => approvedIds.has(v.id) && v.video?.storage_path)`.
   - Slides in from the left with `translate-x-[calc(-100%-1.25rem)]` when closed.
   - Has its own `X` close button.
   - Backdrop overlay only for this left panel on small screens.

5. **Layout adjustments**:
   - The center content (`main`) currently has padding for the always-on right panel. Keep that the same; nothing changes for the center.
   - Remove the now-stale right-panel backdrop overlay (since right panel never overlays).

## What stays unchanged

- Polling, progress bars, generation mode toggle (Text/Image to Video), composer/form, "+" new-card button, edge functions, contracts, database. Pure frontend layout + a localStorage-backed approval flag.

## Acceptance

- Right "Recent outputs" panel is visible at all times; no `X`; clicking outside doesn't close it.
- Top-left 4-square icon toggles a separate **left**-side panel.
- Left panel is empty until the user clicks "Save to library" / "Approve" on a completed render in the right panel.
- Approved videos persist across page reloads (per logged-in user).
- Un-approving a video removes it from the left panel.
