# Add download button to AI image dialog

The user wants a download icon in the AI image generation dialog footer — in the empty space circled in red, between **Regenerate** and **Use this image** — so they can save the generated image locally before (or instead of) using it in the project.

## Scope

UI-only change in `src/modules/generator-ui/components/AiImageDialog.tsx`. No backend, storage, or business-logic changes.

## Changes

**`src/modules/generator-ui/components/AiImageDialog.tsx`**

1. Import `Download` from `lucide-react` (alongside the existing icons).
2. Add a `handleDownload` function that:
   - Returns early if `!imageDataUrl`.
   - Converts the current `imageDataUrl` (data URL) to a `Blob` via the existing `dataUrlToBlob` helper.
   - Creates an `ObjectURL`, triggers an `<a download="ai-image-{timestamp}.png">` click, then revokes the URL.
   - Wrapped in try/catch; on failure falls back to `window.open(imageDataUrl, '_blank')`.
3. Insert a new ghost `<Button>` with the `Download` icon + label "Download" in the footer (lines 624-658), placed between the **Regenerate** button and the **Use this image** button. Disabled when `!imageDataUrl || isLoading || isSaving`.
4. Keep existing button styling/sizing consistent (`variant="ghost"`, `size="sm"`, `h-4 w-4 mr-2` icon).

## Out of scope

- No changes to Pending/Library/History logic.
- No changes to the live-preview `+` icon work from prior turns.
- No new dependencies.

## Verification

- Open the AI image dialog, generate an image, click **Download** → browser saves a `.png`.
- Button is hidden/disabled when no image is generated yet.
- Regenerate and Use this image still work unchanged.
