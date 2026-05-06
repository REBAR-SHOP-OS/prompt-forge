## Goal

Add a small icon button right next to the existing `+` button in the History panel header (top-right of the dashboard). Clicking it lets the user pick an image from their computer. The image is uploaded to Lovable Cloud (Supabase Storage) and immediately appears in the **Recent outputs** column as a card — using a fixed **1:1** aspect ratio for image cards, regardless of the project's locked video ratio. Images persist across sessions per user.

## Behavior

1. **Icon placement** — Inside the header row at lines ~2047–2060 of `DashboardPage.tsx`, add an `ImagePlus` (or `ImageUp`) icon button immediately to the **left** of the existing `+` button. Same size/style as `+` (`h-8 w-8`, rounded-full, white/10 border). Tooltip: "Upload image".

2. **Upload flow**
   - Click → opens a hidden `<input type="file" accept="image/*">`.
   - On file pick: validate (image only, max 10 MB).
   - Show inline progress (button switches to a small spinner while uploading).
   - Upload to a new public storage bucket `user-images` at path `{userId}/{uuid}.{ext}`.
   - Insert a row into a new `generator_user_images` table with the public URL + metadata.
   - Toast on success / failure.

3. **Display as card in Recent outputs**
   - Image cards render in the same column as video cards, **interleaved by `created_at`** (newest first), so a freshly uploaded image appears at the top alongside video renders.
   - Image cards always render with `aspect-ratio: 1/1` regardless of the project's `lockedRatio`. The video aspect-ratio lock continues to apply only to video generation, not to images.
   - Card layout mirrors a video card: 1:1 thumbnail, no prompt text (or a small "Uploaded image" label), and only two action icons in the footer:
     - **Bookmark** (save to library — same toggle as video cards, reusing `approvedIds`).
     - **Trash** (soft-delete — sets `deleted_at` on the row, removes from view).
   - No drag-reorder, no edit/regenerate, no transition selector for image cards (they are reference-only assets).

4. **Persistence & loading**
   - On dashboard mount (alongside the existing `videos-list` / `jobs-list` hydration), fetch the user's non-deleted images from `generator_user_images` and merge them into the `displayedVideos` list as a separate variant.

5. **Out of scope (for now)**
   - Using the uploaded image as a Start/End frame for generation. (User said the image should be used as a card in Recent outputs; existing Start/End frame buttons in the prompt bar are not changed.)
   - Editing the image.

## Technical changes

### Database (migration)

```sql
create table public.generator_user_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,    -- public URL or bucket path
  width int,
  height int,
  size_bytes int,
  mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.generator_user_images enable row level security;

create policy "users select own images"
  on public.generator_user_images for select
  using (auth.uid() = user_id);

create policy "users insert own images"
  on public.generator_user_images for insert
  with check (auth.uid() = user_id);

create policy "users update own images"
  on public.generator_user_images for update
  using (auth.uid() = user_id);

create index on public.generator_user_images (user_id, created_at desc)
  where deleted_at is null;
```

### Storage bucket (migration)

```sql
insert into storage.buckets (id, name, public)
values ('user-images', 'user-images', true);

create policy "users upload to own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'user-images'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "public read user-images"
  on storage.objects for select
  using (bucket_id = 'user-images');

create policy "users delete own images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'user-images'
         and (storage.foldername(name))[1] = auth.uid()::text);
```

### Frontend — `src/modules/generator-ui/pages/DashboardPage.tsx`

1. Add `userImages` state (`UserImage[]`) and a fetch effect using the supabase client.
2. Add `handlePickImage` / `handleUploadImage` (hidden input ref, calls `supabase.storage.from('user-images').upload(...)` then inserts a row).
3. Header (lines 2047–2060): add hidden `<input type="file">` + new `<button>` with `ImagePlus` icon to the left of the existing `+` button. Show `LoaderCircle` while uploading.
4. Build a unified `feedItems` list: `[...displayedVideos.map(v => ({kind:'video', ...})), ...userImages.map(i => ({kind:'image', ...}))]` sorted by `created_at` desc.
5. In the render map (lines 2078–2200+), branch on `kind`: render the existing video `<article>` for `kind === 'video'`, and a simpler image `<article>` for `kind === 'image'` (1:1 box with `<img>`, bookmark + trash icons only).
6. Soft-delete handler updates the row's `deleted_at` and removes it from local state.

### No changes needed

- `lockedRatio` logic stays as-is — it only governs video generation; image cards opt out by always rendering 1:1.
- No edge function needed: uploads use the supabase JS client directly with RLS.
- No changes to merge/audio/transition flows.
