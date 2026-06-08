# Add Audio (Music + Voiceover) to Storage

## Goal
In the Storage panel (next to **Films** and **Images**), add a new **Audio** tab with its own icon. Uploaded background music and generated voiceovers will be saved permanently to the user's account and shown here, each with a play preview, a download button, and a delete button — matching the existing Images tab behavior.

## Problem today
Music and voiceovers currently live only as in-browser blob URLs (`URL.createObjectURL`). They vanish on refresh and are never saved to the account, so they can't appear in Storage. To list and download them later, they must be persisted to the backend.

## What will be built

### 1. Backend storage + table
- New private storage bucket `user-audio` for music and voiceover files.
- New table `generator_user_audio` tracking each item: owner, storage path, kind (`music` or `voiceover`), display name, duration, size, mime type, timestamps, soft-delete — mirroring `generator_user_images`.
- Row-level security so each user only sees/manages their own audio, plus the required table grants.

### 2. Saving audio
- When a user uploads background music, after selecting the file it is uploaded to `user-audio` and a row is created (kind = `music`). Local preview/editing keeps working as it does now.
- When a voiceover is generated, its audio is uploaded to `user-audio` and a row is created (kind = `voiceover`).
- Existing in-session playback/mixing behavior is unchanged; persistence is added alongside it.

### 3. Storage panel "Audio" tab
- Add a third tab button with an audio icon (e.g. music note), with a count badge like the others.
- Tab content lists saved audio cards, each showing: name, kind label (Music / Voiceover), created date, an inline audio player to preview, a **Download** button, and a **Delete** (with confirm dialog) button — reusing the existing download/delete patterns.
- Loading and empty states consistent with the Films/Images tabs.
- The header count and description update for the Audio tab.

## Technical details
- **Migration**: create bucket `user-audio`; create `public.generator_user_audio` (columns: `id`, `user_id`, `storage_path`, `kind text check in ('music','voiceover')`, `name text`, `duration_seconds numeric`, `size_bytes int`, `mime_type text`, `created_at`, `updated_at`, `deleted_at`); add `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` + `GRANT ALL ... TO service_role`; enable RLS with own-row policies; add `updated_at` trigger; add storage.objects policies on `user-audio` scoped to the user's folder.
- **Client uploads**: direct `supabase.storage.from('user-audio').upload(...)` + insert into `generator_user_audio`, mirroring the existing `user-images` flow in `DashboardPage.tsx` (around lines 3094, 4390 for music) and in `VoiceoverDialog.tsx` (around line 119, after the blob is produced).
- **Listing**: load audio rows on Storage open (extend `loadArchive`) into a new `archiveAudio` state; render under `archiveTab === 'audio'`.
- **Files touched**: new migration; `src/modules/generator-ui/pages/DashboardPage.tsx` (tab state `'films' | 'images' | 'audio'`, tab button, list UI, load + download + delete handlers, music upload persistence); `src/modules/generator-ui/components/VoiceoverDialog.tsx` (persist generated voiceover).

## Acceptance
- Storage panel shows a third **Audio** tab with an icon and count.
- Uploading music adds it to the Audio tab; generating a voiceover adds it there too.
- Each audio item previews, downloads, and deletes correctly.
- Items persist across page reloads and are private per user.
- Films/Images tabs and existing music/voiceover mixing behavior are unchanged.
