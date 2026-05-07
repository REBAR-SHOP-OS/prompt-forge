-- Make user-images bucket public so getPublicUrl works for <img> and Final Film
UPDATE storage.buckets SET public = true WHERE id = 'user-images';

-- Relax SELECT policy on generator_user_images to allow owner to see own rows
-- regardless of deleted_at. Soft-delete is filtered in client queries.
-- Root cause: PostgREST returns the updated row by default; if the new row
-- fails SELECT (because deleted_at IS NOT NULL after soft-delete), it raises
-- 42501 "new row violates row-level security policy".
DROP POLICY IF EXISTS "user_images: users select own" ON public.generator_user_images;

CREATE POLICY "user_images: users select own"
  ON public.generator_user_images FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);