DROP POLICY IF EXISTS "Public read merged-videos" ON storage.objects;
DROP POLICY IF EXISTS "user-videos public read" ON storage.objects;

CREATE POLICY "user-videos: authenticated read own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-videos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);