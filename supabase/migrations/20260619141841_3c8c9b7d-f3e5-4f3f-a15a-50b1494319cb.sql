CREATE POLICY "Users can read their own mp4 exports"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'mp4-exports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);