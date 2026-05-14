## Problem
The download icon on each Library card is an `<a href={storage_path} download>`. Because the file is served from a cross-origin Supabase storage URL, the browser ignores the `download` attribute and either opens the video in a new tab or just navigates — the file is not saved.

## Fix
Replace the `<a download>` with a button that fetches the merged final video as a blob and triggers a real download (the established cross-origin download pattern).

### Changes — `src/modules/generator-ui/pages/DashboardPage.tsx` only

1. Add a small helper `downloadFinalFilm(url, filename)` that:
   - `await fetch(url)` → `response.blob()`
   - Creates an object URL, a temporary `<a download={filename}>`, clicks it, then revokes the URL.
   - On failure, falls back to `window.open(url, '_blank')`.
   - Shows a toast on error.

2. In the Library card (around line 3844), replace the `<a href ... download>` with a `<button>` that calls `downloadFinalFilm(video.video.storage_path, derivedName)` where `derivedName` is `final-film-<shortId>.mp4` (e.g. `final-film-${video.id.slice(0,8)}.mp4`).

3. Keep `event.stopPropagation()` so clicking the icon does not also open/select the project card. Keep styling, aria-label, and title unchanged.

### Out of scope
No backend, contract, or storage changes. No edits to other download buttons unless the user asks. Only the Library final-film download icon is touched.

### Verification
- Click the download icon on a Library item → browser saves `final-film-xxxxxxxx.mp4` directly without opening a new tab.
- Card click behavior, delete button, and preview behavior unchanged.