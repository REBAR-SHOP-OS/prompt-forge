# Plan: Fix blank previews for Final Film library cards

## Root cause (verified against live data)

I inspected the actual library data and storage in the running app:

- All 6 "Final Film" library entries are stored with `thumbnail_url = null`. So a card's preview depends **entirely** on loading the merged `.webm` from the private `merged-videos` bucket and seeking to a frame.
- For the two blank cards (the recent "Final Film (1 clip)" entries), the merged `.webm` files **no longer exist in storage** — signing them returns `Object not found`. The other four finals' files still exist, which is why only those render.
- The card has **no fallback**: when the merged file is gone, `PlayableVideo` never paints, and since there is no poster, the tile stays blank.

So this is two compounding issues: (1) finals never persist a poster image, and (2) the card cannot fall back to anything when the heavy video asset is unavailable.

Note: one of the two broken finals still has a valid source clip snapshot in storage; the other's source clip is also gone (unrecoverable — nothing left to preview).

## Changes — `src/modules/generator-ui/pages/DashboardPage.tsx`

### 1. Persist a poster thumbnail at finalize (prevention)

In the Final Film finalize flow (around line 6778-6833), after the merged blob is produced, capture a single frame as a compact JPEG data URL and store it as `thumbnail_url` on the library entry:

- Add a small helper `captureVideoPoster(blob: Blob): Promise<string | null>` that loads the blob into an offscreen `<video>`, seeks to ~1s (or near end for very short clips), draws to a `<canvas>`, and returns `canvas.toDataURL('image/jpeg', 0.7)`. Fails gracefully to `null`.
- Use its result for `libraryEntry.video.thumbnail_url` instead of `null`.

Because posters are tiny and live in the same localStorage entry, the card now shows a real preview even if the merged file later disappears (`PlayableVideo` already renders `poster` as a background `<img>` whenever the video itself can't paint).

### 2. Final card display fallback (recovery for existing entries)

In the library card renderer (around line 10054), replace the final branch `display = video.video` with a resolver that mirrors the draft logic:

- Prefer `video.video` when it has a usable `storage_path`.
- Otherwise (or in addition, for the poster), fall back to the first source-clip snapshot in `projectSourceJobs[video.id]` that has a `storage_path`, using its `storage_path` + `thumbnail_url`.

This recovers any broken final whose source clip still exists, and is harmless for healthy entries.

### 3. Pass the resolved poster to the card

Ensure the final card's `PlayableVideo` receives `poster={display.thumbnail_url ?? undefined}` (already wired) so the new poster path takes effect.

## Out of scope / honest limitation

The one fully-orphaned final (both its merged file and its only source clip are deleted from storage) has no remaining asset to preview; for it the card will show the neutral film icon rather than a blank black box. All other current and future finals will show a proper preview.
