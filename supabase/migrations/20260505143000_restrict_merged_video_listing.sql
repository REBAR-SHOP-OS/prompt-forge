-- Reduce the storage.objects read surface for merged-videos without breaking
-- existing public URL playback. Public bucket delivery still works, but direct
-- object listing via PostgREST is limited to the owning authenticated user.

DROP POLICY IF EXISTS "Public read merged-videos" ON storage.objects;

CREATE POLICY "merged-videos: owners list own folder"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'merged-videos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);