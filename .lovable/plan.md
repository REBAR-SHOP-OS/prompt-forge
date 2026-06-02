## Goal

In the **STORAGE** ("All films") modal, clicking on a film card's thumbnail should play that film inline (with video controls), instead of the card staying a static poster.

## Current behavior

In `src/modules/generator-ui/pages/DashboardPage.tsx` (archive modal, ~lines 5058–5165), each card renders a `<PlayableVideo thumbnail … />` that shows a frozen frame/poster. There is no click handler, so nothing happens when the user clicks a card. Only the Download and Delete icon buttons are interactive.

## Change

All edits in `src/modules/generator-ui/pages/DashboardPage.tsx`.

1. **Add local state** near the other archive state (`deletingArchiveId`, etc.):
   `const [playingArchiveId, setPlayingArchiveId] = useState<string | null>(null)`
   Reset it to `null` when the archive dialog closes so reopening starts fresh.

2. **Make the thumbnail area clickable** (the `div` with `aspect-video`, ~line 5067):
   - Add `onClick`, `role="button"`, `tabIndex`, and keyboard handler so clicking a card with a playable `video.storage_path` sets `playingArchiveId = job.id`.
   - When `playingArchiveId === job.id`, render `PlayableVideo` in **full playback mode** (not `thumbnail`): pass `controls`, `autoPlay`, `playsInline`, and the same `getCardVideoSrc(...)` source, filling the tile.
   - Otherwise keep the existing `thumbnail` poster render. Add a subtle play affordance (e.g. a small centered play icon overlay) on the thumbnail so it reads as clickable.
   - Only one film plays at a time (clicking another card switches `playingArchiveId`).

3. The Download/Delete buttons already call `event.stopPropagation()`, so they won't trigger playback. No change needed there.

## Technical notes

- Reuse the existing `PlayableVideo` component — it already proxies the URL and handles retries. Playback mode is simply omitting the `thumbnail` prop and adding `controls`/`autoPlay`.
- Cards without `video.storage_path` (e.g. still rendering) remain non-clickable and keep the `Clapperboard` placeholder.
- Purely a client-side UI change; no backend, schema, or data changes.

## Files touched
- `src/modules/generator-ui/pages/DashboardPage.tsx`
