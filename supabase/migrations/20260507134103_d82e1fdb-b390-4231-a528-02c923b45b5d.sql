UPDATE storage.buckets SET public = true WHERE id = 'merged-videos';

DROP POLICY IF EXISTS "Public read merged-videos" ON storage.objects;
CREATE POLICY "Public read merged-videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'merged-videos');