-- 1) Add first_frame_url and last_frame_url to generation jobs
ALTER TABLE public.generator_generation_jobs
  ADD COLUMN IF NOT EXISTS first_frame_url text,
  ADD COLUMN IF NOT EXISTS last_frame_url  text;

-- 2) Update Wan provider registry: Singapore endpoint + wan2.7-i2v default model
UPDATE public.core_ai_provider_registry
   SET default_model = 'wan2.7-i2v',
       base_url      = 'https://dashscope-intl.aliyuncs.com',
       enabled       = true,
       updated_at    = now()
 WHERE provider_key = 'wan';

INSERT INTO public.core_ai_provider_registry (provider_key, display_name, default_model, base_url, enabled)
SELECT 'wan', 'Alibaba Wan (DashScope)', 'wan2.7-i2v', 'https://dashscope-intl.aliyuncs.com', true
WHERE NOT EXISTS (SELECT 1 FROM public.core_ai_provider_registry WHERE provider_key = 'wan');

-- 3) Public storage bucket for first/last frame uploads (Wan needs reachable URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('wan-frames', 'wan-frames', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 4) RLS policies for wan-frames bucket (public read, authenticated write to own folder)
DROP POLICY IF EXISTS "wan-frames: public read" ON storage.objects;
CREATE POLICY "wan-frames: public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'wan-frames');

DROP POLICY IF EXISTS "wan-frames: users upload own folder" ON storage.objects;
CREATE POLICY "wan-frames: users upload own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'wan-frames'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "wan-frames: users update own folder" ON storage.objects;
CREATE POLICY "wan-frames: users update own folder"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'wan-frames'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "wan-frames: users delete own folder" ON storage.objects;
CREATE POLICY "wan-frames: users delete own folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'wan-frames'
  AND auth.uid()::text = (storage.foldername(name))[1]
);