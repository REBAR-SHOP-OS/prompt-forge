## Goal
Two fixes in the preview area of `src/modules/generator-ui/pages/DashboardPage.tsx`:

1. The "Live preview — playing all cards" pill currently overlaps the fixed top toolbar (Start over / Final film / Music / Voiceover). Make it a clearly separate control that no longer sits on top of those buttons.
2. Clicking on the empty (black) space around the preview should start the full live preview of all cards stitched together.

## Changes

### 1. Stop the preview pill from overlapping the toolbar
The toolbar is `fixed top-4` and horizontally centered. The preview pill (lines 7443-7471) is also centered and sits at `top-3` of `<main>`, so they collide.

- Reposition the pill so it sits clearly **below** the fixed toolbar (move from `top-3` to roughly `top-16`, i.e. below the ~52px toolbar row), keeping it centered and visually distinct.
- Adjust `<main>`'s `paddingTop` (line 7441) if needed so the lowered pill doesn't overlap the player.
- Keep all existing styling/states (emerald "live" state vs. default Play icon) and its onClick (`setVideoColumnMessage(null)`, `setPreviewVideoId(null)`, `setPreviewDismissed(false)`).

### 2. Click empty space → play all cards
On the `<main>` background element (line 7438), add an `onClick` that triggers the same live-preview action used by the pill, but only when the click lands on the empty background itself (guard with `e.target === e.currentTarget`) so clicks on the player/controls are not hijacked. Only active when `playableSequenceClips.length >= 2`. Add `cursor`/`title` affordance so users understand the empty area is clickable.

## Verification
- With 2+ ready cards: the pill renders below the toolbar with no overlap; clicking it plays the full sequence.
- Clicking the black empty area around the player starts the all-cards live preview; clicking the player itself does not reset it.

This is a frontend/presentation-only change — no business logic or backend changes.