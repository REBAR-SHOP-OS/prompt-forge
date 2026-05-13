# Fix: "Upload film" button does nothing

## Findings
- The icon button at the History header (`aria-label="Upload film"`, around `DashboardPage.tsx:3062`) calls `uploadVideoInputRef.current?.click()` on a sibling `<input type="file" className="hidden">`.
- In the browser sandbox the click is dispatched on the button (verified via `browser--act`), so the React handler runs, but the OS file-picker does not open reliably in this layout — the `<input>` is rendered as a *sibling next to the button* inside a `flex` row that includes other interactive icons. Clicks on hidden file inputs triggered programmatically can be swallowed by the user-gesture chain when the surrounding element re-renders during an active render/poll cycle (the History panel re-renders every poll tick while a Final Film render is in progress, which matches the user's screenshot).
- `handleUploadVideoFile` itself is fine; the problem is that the picker never opens, so the handler never fires.

## Fix (frontend only — `src/modules/generator-ui/pages/DashboardPage.tsx`)

Replace the ref+`.click()` pattern with a bullet-proof `<label htmlFor>` pattern that does not depend on a programmatic click within a re-rendering subtree:

1. Give the file input a stable `id="upload-film-input"` and keep `ref={uploadVideoInputRef}` (still used elsewhere if needed).
2. Replace the `<button onClick={…}>` with a `<label htmlFor="upload-film-input">` styled identically to the existing icon buttons (`grid h-8 w-8 place-items-center rounded-full …`), with `role="button"`, `aria-label="Upload film"`, `title="Upload film"`, and `aria-disabled={isUploadingVideo}`.
3. When `isUploadingVideo` is true, add `pointer-events-none opacity-60` to the label and disable the input via `disabled` so re-clicks during upload are ignored.
4. Keep the `<input>` mounted at the top of the icon row (not conditionally rendered) so the label always has a target.
5. Move the `<input>` *out of the flex row visually* using `className="sr-only"` (still focusable / picker-triggerable, more reliable than `display:none`'s `hidden`).
6. Keep `handleUploadVideoFile` unchanged.

## Verification
- Click the new Upload film label → OS file picker opens immediately, even while a Final Film render progress dialog is on screen.
- Pick a small `.mp4` → spinner appears in the icon, then a new History card is added.
- During upload the icon shows the spinner and further clicks are ignored.
- No regressions to the image-upload icon or the `+` add-card icon next to it.

## Out of scope
- No changes to `handleUploadVideoFile` upload logic, storage, or job pipeline.
- No layout changes outside the History header icon row.
