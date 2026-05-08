
-- Add missing UPDATE policy on storage.objects for user-videos bucket (owner-scoped)
CREATE POLICY "Users can update own user-videos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'user-videos' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'user-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Tighten merged-videos write policies from {public} to {authenticated}
ALTER POLICY "Users can upload own merged-videos" ON storage.objects TO authenticated;
ALTER POLICY "Users can update own merged-videos" ON storage.objects TO authenticated;
ALTER POLICY "Users can delete own merged-videos" ON storage.objects TO authenticated;
