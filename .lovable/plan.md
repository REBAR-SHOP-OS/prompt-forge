# Fix library downloads (WEBM + MP4) for NAS-backed files

## What's actually happening

All 67 media files were migrated to the Synology NAS and their **Cloud copies were deleted**. The download code wasn't fully updated for that reality:

### Bug 1 — "Download original (WEBM)" is broken
`downloadDirect()` (the handler behind the original/WEBM option) is **not NAS-aware**. For a `merged-videos` / `user-videos` URL it calls `createSignedUrl(...)` on the Cloud object. Signing still "succeeds" even though the file was deleted from Cloud, so the browser is handed a signed URL that **404s**. It never asks the NAS stream proxy, so WEBM downloads fail.

### Bug 2 — cross-origin `download` attribute is ignored
Both handlers ultimately do `a.href = <functions-domain URL>; a.download = name; a.click()`. Because the NAS stream URL is **cross-origin** (the edge-functions domain), the browser **ignores the `download` attribute**. It only saves if the server sends `Content-Disposition: attachment`. The MP4 path passes `download` to the proxy (so the header is set) but the original/WEBM path does not — and even when it works, relying on the header alone is fragile (a stream hiccup opens the video in a tab instead of saving).

The edge logs show repeated `connection closed before message completed` on `synology-storage-stream`, consistent with the browser navigating to the stream and aborting instead of saving.

## The fix (frontend only)

### 1. One reliable download trigger
Add a small helper that performs a true cross-origin download by fetching the bytes into a Blob and saving via an object URL (final films are < ~200 MB, safe to buffer), with an anchor-click fallback:

```text
triggerDownload(href, filename):
  try: fetch(href) -> blob -> objectURL -> <a download> click -> revoke
  catch: fallback to <a href download> click, then window.open
```

### 2. Make `downloadDirect` (original/WEBM) NAS-aware
- Resolve `{bucket, path}` from the stored value (handles both full Storage URLs **and** bare `bucket/path` refs).
- First try `resolveNasStreamUrl(bucket, path, filename)` → returns the stream-proxy URL **with the `download` filename** so the server sets `Content-Disposition: attachment`.
- Else fall back to `createSignedUrl(path, ttl, { download: filename })` on the correct bucket.
- Hand the resulting `href` to `triggerDownload(href, filename)`.

### 3. Route `downloadAsMp4`'s `downloadSigned` through the same `triggerDownload`
Keeps the existing NAS-aware/signed logic but makes the final save reliable instead of depending on the cross-origin `download` attribute.

## Files changed
- `src/modules/generator-ui/pages/DashboardPage.tsx` — add `triggerDownload` helper; make `downloadDirect` NAS-aware; route `downloadSigned` through `triggerDownload`.

No backend, schema, or UI changes. The two menu options and their icons stay exactly as-is.

## Verification
1. Confirm in `storage_objects` the target films are `backend=synology, status=active` (already verified: latest MP4 film + WEBM merges are on NAS).
2. In the preview: open Library → a final film → Download menu:
   - Click **Download as MP4** → an `.mp4` file saves.
   - Click **Download original (WEBM)** on a WEBM film → a `.webm` file saves.
3. Watch `synology-storage-stream` logs for a clean `200`/`206` with `Content-Disposition` and no premature close.

## Risk
Low. Buffering into a Blob uses memory proportional to file size (final films are small); the anchor + `window.open` fallback covers any fetch failure. No change to playback, migration, or storage routing.
