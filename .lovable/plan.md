## Replace dual download buttons with a single icon + dropdown (MP4 / WEBM)

### Goal
On the Final Film cards in the library sidebar, replace the current two-button download area (download icon + "MP4" pill) with a single download icon. Clicking the icon opens a `DropdownMenu` offering two choices: **MP4** and **WEBM**.

### Changes

#### 1. `src/modules/generator-ui/pages/DashboardPage.tsx`

**A. Update `downloadDirect` signature**
Add an optional `forcedExt?: string` parameter so we can explicitly request `.webm` output:
```ts
const downloadDirect = async (cardId: string, url: string, namePrefix: string, forcedExt?: string) => {
```
Inside the function, when computing `ext`, use `forcedExt` if provided:
```ts
const ext = forcedExt || (lower.endsWith('.mp4') ? 'mp4' : lower.endsWith('.webm') ? 'webm' : ...)
```

**B. Wrap the download buttons in a `DropdownMenu`**
Replace the existing `<button>` (direct download) + `<button>` (MP4) pair inside the Final Film card actions with:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button
      type="button"
      disabled={downloadingId === job.id}
      onClick={(event) => event.stopPropagation()}
      aria-label="Download video"
      title="Download"
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-400 transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-200 disabled:opacity-60"
    >
      {downloadingId === job.id ? (
        <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-3 w-3" aria-hidden="true" />
      )}
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="min-w-[120px]">
    <DropdownMenuItem
      disabled={downloadingId === job.id}
      onClick={(event) => {
        event.stopPropagation()
        if (!video) return
        void downloadAsMp4(job.id, video.storage_path, 'film')
      }}
    >
      Download as MP4
    </DropdownMenuItem>
    <DropdownMenuItem
      disabled={downloadingId === job.id}
      onClick={(event) => {
        event.stopPropagation()
        if (!video) return
        void downloadDirect(job.id, video.storage_path, 'film', 'webm')
      }}
    >
      Download as WEBM
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

**C. Keep the same disabled/loading state**
`downloadingId === job.id` continues to disable all options and show the spinner on the trigger icon.

### Why this works
- `downloadAsMp4` already fetches the file and runs `ensureMp4` (ffmpeg.wasm) to guarantee a standard MP4.
- `downloadDirect` with `forcedExt = 'webm'` mints a signed URL and sets `Content-Disposition` to `.webm`, giving the user the original high-quality WEBM without any in-browser transcoding.
- The `DropdownMenu` component is already imported and used elsewhere in the same file.

### No other files need changes.