# Move Upload to History column, rename to "Upload film"

## Goal
Move the existing top-bar `UPLOAD` action into the History panel header (right-side column), in the icon row next to the image-upload and `+` buttons, styled as a small round icon button. Rename label/tooltip to "Upload film". Keep all upload behavior identical.

## Changes (frontend only — `src/modules/generator-ui/pages/DashboardPage.tsx`)

1. **Remove** the top-bar Upload button block at lines ~2404–2433 (the `<input ref={uploadVideoInputRef}>` + `<button>` pair). Keep `uploadVideoInputRef` and `handleUploadVideoFile` — they get reused below.

2. **Add** in the History header icon row (lines ~3064–3094), inserted between the image-upload button and the `+` button:
   ```tsx
   <input
     ref={uploadVideoInputRef}
     type="file"
     accept="video/*"
     className="hidden"
     onChange={handleUploadVideoFile}
   />
   <button
     type="button"
     onClick={() => uploadVideoInputRef.current?.click()}
     disabled={isUploadingVideo}
     className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-[#141518]/95 text-zinc-300 transition hover:border-sky-300/30 hover:bg-sky-300/[0.08] hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
     aria-label="Upload film"
     title="Upload film"
   >
     {isUploadingVideo ? (
       <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
     ) : (
       <Upload className="h-4 w-4" aria-hidden="true" />
     )}
   </button>
   ```

## Out of scope
- No changes to upload logic, storage, or job pipeline.
- Top-bar layout otherwise unchanged (Start over and Final film stay).

## Verification
- Top bar no longer shows UPLOAD.
- History header shows three round icons: image-plus, upload (film), plus.
- Hover tooltip reads "Upload film"; clicking opens video picker; while uploading, spinner replaces icon and button is disabled.
