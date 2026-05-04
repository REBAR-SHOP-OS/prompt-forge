
INSERT INTO storage.buckets (id, name, public) VALUES ('merged-videos', 'merged-videos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read merged-videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'merged-videos');

CREATE POLICY "Users can upload own merged-videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'merged-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own merged-videos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'merged-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own merged-videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'merged-videos' AND auth.uid()::text = (storage.foldername(name))[1]);
