## Goal

Treat each uploaded image as a first-class clip in `Recent outputs`, identical to a video card in:
- Card UI (selection highlight, drag handle, delete button, number badge)
- Click → shown in the central preview
- Mixed time-based ordering with videos (sort by created_at, drag-and-drop reorderable)
- Inclusion in **Final Film** merge as a still-frame clip with a per-card configurable duration

## Changes

### 1. Database (migration)

Add a `still_duration_seconds` column to `generator_user_images` so each image can be merged with its own duration:

```sql
ALTER TABLE public.generator_user_images
  ADD COLUMN still_duration_seconds integer NOT NULL DEFAULT 3;
```

Update existing user_images RLS already covers user UPDATE — no policy change needed.

### 2. `DashboardPage.tsx` — unified card model

Introduce a `UnifiedClip` discriminated union:
```ts
type UnifiedClip =
  | { kind: 'video'; id: string; createdAt: string; job: JobDetail }
  | { kind: 'image'; id: string; createdAt: string; image: UserImageItem }
```

Build `displayedClips` by:
1. Mapping `displayedVideos` → `{kind:'video'}` and `userImages` → `{kind:'image'}`
2. Sorting by `created_at` ascending (oldest first, matches existing video card numbering)
3. Applying the existing `manualOrder` array (extend it to accept image IDs too — same drag/drop handlers work since they key on `id` strings)

Replace the two separate `.map()` blocks (lines 2222–2253 for images, 2254+ for videos) with a single `displayedClips.map()` that branches on `kind`:

- **Image branch** renders an `<article>` with the same classes/states as the video card:
  - Same selection ring (`isPreviewSelected = previewVideo?.id === clip.id`)
  - Same drag handlers (`handleCardDragStart/Over/Drop/End`)
  - Same number badge (uses index in `displayedClips`, so images and videos share one numbering sequence)
  - Same trash button (calls `handleDeleteUserImage`)
  - `onClick={() => setPreviewVideoId(clip.id)}` — central preview switches to the image
  - **Duration control**: small inline numeric input (1–15s) under the prompt slot, bound to per-image `still_duration_seconds`; updates DB via `supabase.from('generator_user_images').update({still_duration_seconds}).eq('id', img.id)` (debounced)

### 3. Central preview supports images

Extend `previewVideo` memo to `previewItem` returning either a video job or an image. Update the preview render (lines 2032–2140):

- If `kind === 'image'`: render `<img src={image.storage_path}>` inside the same chrome
- Container uses **project aspect ratio** (`aspectRatio` state, e.g. 9:16) with `object-contain` so the image is letter/pillarboxed inside the project frame
- Title/status row shows "Uploaded image" + dimensions instead of prompt + status dot
- Hide the rendering progress overlay for images

### 4. Final Film merge includes images

In `handleMergeAllVideos` (line 1548):

1. Build `orderedItems` from the same `displayedClips` order, keeping both completed videos and images
2. For each image, generate a still-frame clip on the fly using a canvas → MediaRecorder helper:
   - New util `src/modules/generator-ui/lib/imageToVideoClip.ts` that takes `{url, durationSec, width, height}` and returns a `Blob` (webm) using `OffscreenCanvas` + `MediaRecorder` (or canvas + `captureStream`)
   - Width/height match the first video clip's intrinsic size (consistent with current merge behavior at line 1604–1608); if no video exists, fall back to project ratio at 1080p
3. Upload each generated still-clip to `MERGED_BUCKET` under `${userId}/still-${imgId}-${ts}.webm`, get public URL
4. Pass the resulting URL list (mixed video+still URLs) into the existing `mergeVideoUrls` pipeline — no change to `mergeVideos.ts`
5. Transition specs already key off clip ID, which works unchanged for image IDs

Update the merge eligibility check from "≥2 finished videos" to "≥2 finished items (videos + images)".

### 5. Numbering & "Start Over"

- Number badge uses the unified index so images and videos share one sequence
- `handleStartOver` (line 1653) also soft-deletes images: add image IDs to a separate `deletedImageIds` set persisted in localStorage and filter them out of `userImages` view (DB rows kept, mirrors video behavior)

## Technical notes

- No edge-function changes
- `userImages` fetch in the existing `useEffect` adds `still_duration_seconds` to the select
- `UserImageItem` type gets `still_duration_seconds: number` and optional `width/height`
- All existing video-only logic (approve/library, transitions UI on the card, etc.) stays gated to `kind === 'video'` — images get a simpler card footer (duration input + delete only)

## Out of scope

- Image editing / reordering frames within an image
- Generating videos *from* the uploaded image (that's the existing Image-to-Video flow, untouched)
