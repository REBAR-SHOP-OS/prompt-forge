-- Add profile fields to core_user_profiles for editable profile section.
-- Users can update their own first_name, last_name, avatar_url via existing
-- RLS policy "profiles: users update own". The guard trigger already prevents
-- non-admin users from changing credits_balance, so these new columns are safe.

ALTER TABLE public.core_user_profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- =========================================================
-- Avatars storage bucket (public read, user-scoped write)
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars: public read" ON storage.objects;
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars: users upload own folder" ON storage.objects;
CREATE POLICY "avatars: users upload own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "avatars: users update own folder" ON storage.objects;
CREATE POLICY "avatars: users update own folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "avatars: users delete own folder" ON storage.objects;
CREATE POLICY "avatars: users delete own folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );