-- Replace broad public SELECT with owner-only listing.
-- Public URL access still works because public buckets serve files directly via the storage CDN
-- without going through the RLS-protected storage.objects SELECT path.
DROP POLICY IF EXISTS "wan-frames: public read" ON storage.objects;

CREATE POLICY "wan-frames: owners list own folder"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'wan-frames'
  AND auth.uid()::text = (storage.foldername(name))[1]
);