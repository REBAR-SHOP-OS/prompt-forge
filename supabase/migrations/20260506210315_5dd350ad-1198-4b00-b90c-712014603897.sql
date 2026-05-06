-- ============================================================
-- 1. Make user-images, overlay-assets, merged-videos PRIVATE
-- ============================================================
UPDATE storage.buckets SET public = false WHERE id IN ('user-images', 'overlay-assets', 'merged-videos');

-- ----- user-images -----
DROP POLICY IF EXISTS "user-images: public read" ON storage.objects;
DROP POLICY IF EXISTS "user-images: authenticated read own" ON storage.objects;
CREATE POLICY "user-images: authenticated read own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ----- overlay-assets -----
DROP POLICY IF EXISTS "overlay-assets: public read" ON storage.objects;
DROP POLICY IF EXISTS "overlay-assets: authenticated read own" ON storage.objects;
CREATE POLICY "overlay-assets: authenticated read own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'overlay-assets'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ----- merged-videos -----
DROP POLICY IF EXISTS "merged-videos: public read" ON storage.objects;
DROP POLICY IF EXISTS "merged-videos: authenticated read own" ON storage.objects;
CREATE POLICY "merged-videos: authenticated read own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'merged-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- 2. user_roles: explicit deny for INSERT/UPDATE/DELETE
--    (Postgres already denies by default with no policy, but an
--     explicit restrictive policy makes the intent unambiguous and
--     blocks any future accidental permissive policy.)
-- ============================================================
DROP POLICY IF EXISTS "roles: deny client insert" ON public.user_roles;
CREATE POLICY "roles: deny client insert"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

DROP POLICY IF EXISTS "roles: deny client update" ON public.user_roles;
CREATE POLICY "roles: deny client update"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "roles: deny client delete" ON public.user_roles;
CREATE POLICY "roles: deny client delete"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated, anon
USING (false);