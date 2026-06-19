## Problem

In the Library → Final video → "Project audio" popover, the **Music** and **Voiceover** players show `0:00 / 0:00` and won't play.

## Root cause

The project audio is stored in the **`merged-videos`** bucket, which is **private**. But the code saves and renders the track using `supabase.storage.from('merged-videos').getPublicUrl(...)` (see `persistAudioToStorage`). A public URL on a private bucket returns **403**, so the `<audio>` element never loads the file → duration stays `0:00` and playback fails. The Download button hits the same dead URL.

This is the exact same class of issue already solved for images/videos elsewhere via `signStorageUrl` (which converts a stored public/raw path into a short-lived **signed** URL the private bucket actually serves). The popover just never got that treatment.

## Fix

Render the popover audio through **signed URLs** instead of the stored public URL.

1. **New small inner component `ProjectAudioTrackRow`** (defined inside `DashboardPage` so it can reuse `signStorageUrl`, `downloadAudioFile`, and `downloadingId`):
   - Props: `kind` (`'music' | 'voiceover'`), `track` (`{ url, name }`), `jobId`, label/icon styling.
   - On mount (and when `track.url` changes), call `signStorageUrl(track.url)` and store the resolved signed URL in local state.
   - Render the `<audio controls>` with the **signed** URL; show a tiny "preparing…" state until it resolves.
   - The Download button downloads using the **signed** URL too.

2. **Replace** the two inline `<audio src={audio.music.url}>` / `<audio src={audio.voiceover.url}>` blocks (and their download buttons) in the popover with `<ProjectAudioTrackRow>`.

No database, bucket-privacy, or storage-layout changes — keeping the bucket private and signing on demand is the correct, secure approach (same pattern already used for `archiveAudio` and the copyright check).

## Out of scope
- No change to how audio is uploaded/persisted at finalize time.
- No change to bucket visibility.

## Technical notes
- `signStorageUrl` already parses `/storage/v1/object/public/<bucket>/<path>` URLs and returns a 30-minute signed URL, so stored entries work without re-persisting.
- Signed URLs are generated lazily when the popover/player mounts, so there's no upfront cost for rows the user never opens.