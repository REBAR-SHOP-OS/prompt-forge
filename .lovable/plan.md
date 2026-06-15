## Goal

Move the "Live preview all cards" play button out of the Pending panel header and into the top center toolbar (the spot highlighted in yellow), give it a distinct color, an explanatory tooltip, and a dynamic/animated state — purely a UI change.

## Current state

- The play button lives in the Pending panel header at `src/modules/generator-ui/pages/DashboardPage.tsx` lines 7779–7795. It is a plain neutral icon button (`Play` icon) with title "Live preview all cards" that triggers the connected full-sequence preview (`SequentialClipPlayer`).
- The top centered toolbar is the fixed bar at lines 6943+ (`<div className="fixed left-1/2 top-4 ...">`) containing Start over, Final film, Music, Voiceover.

## Changes

### 1. Remove the play button from the Pending header
Delete the `<button>` block at lines 7779–7795 (the neutral `Play` icon button) so the Pending header keeps only Upload image / AI cover / Upload film.

### 2. Add a distinct, animated play button to the top toolbar
Insert a new button as the first child of the fixed toolbar (line ~6944, before the Start over `AlertDialog`), so it appears at the highlighted left position. It reuses the same click handler logic currently on the old button:
- If `playableSequenceClips.length === 0` → set message "No ready clips to live-preview yet."
- Otherwise clear message, `setPreviewVideoId(null)`, `setPreviewDismissed(false)`.

Visual treatment (distinct color + dynamic):
- Use an accent/emerald gradient or emerald-tinted style so it stands out from the neutral white/[0.04] tabs, e.g. emerald border + emerald background tint + emerald text, matching the existing semantic accent pattern used elsewhere (Final film hover uses emerald).
- Add a dynamic state: a soft pulsing glow / `animate-pulse` ring (or animated emerald ring) that activates when there are ready clips (`playableSequenceClips.length > 0`), so it visually invites the user to play. When no clips are ready, render it dimmed/disabled-looking without the animation.
- Keep the `Play` icon, plus a short label like "Preview" so it reads as a toolbar action consistent with the other labeled tabs.

Tooltip / message to the user:
- Set `title` (and `aria-label`) to clearly state it stitches the cards together, e.g. "Connect all cards into one continuous preview". This communicates that it links the cards together in the preview.

### 3. Keep behavior identical
No change to preview logic, audio sync, or `SequentialClipPlayer`. Only relocation + styling + tooltip + animation.

## Technical details

- File touched: `src/modules/generator-ui/pages/DashboardPage.tsx` only.
- Reuse existing state setters: `playableSequenceClips`, `setVideoColumnMessage`, `setPreviewVideoId`, `setPreviewDismissed`.
- Animation via Tailwind utility classes (`animate-pulse` / ring + shadow), no new dependencies.
- Place the button inside the `fixed left-1/2 top-4` toolbar; if it should remain visible in read-only projects, keep it outside the `!isReadOnlyProject` wrapper (preview is non-destructive, so showing it always is reasonable).
