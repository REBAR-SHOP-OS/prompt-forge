-- Table to track user audio (music uploads + generated voiceovers)
CREATE TABLE public.generator_user_audio (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('music', 'voiceover')),
  name text,
  duration_seconds numeric,
  size_bytes integer,
  mime_type text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generator_user_audio TO authenticated;
GRANT ALL ON public.generator_user_audio TO service_role;

ALTER TABLE public.generator_user_audio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_audio: users select own" ON public.generator_user_audio
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_audio: users insert own" ON public.generator_user_audio
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_audio: users update own" ON public.generator_user_audio
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_audio: users delete own" ON public.generator_user_audio
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_generator_user_audio_user_created
  ON public.generator_user_audio (user_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER set_generator_user_audio_updated_at
  BEFORE UPDATE ON public.generator_user_audio
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage policies for the private user-audio bucket (per-user folder)
CREATE POLICY "user-audio: users read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'user-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user-audio: users insert own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-audio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "user-audio: users delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'user-audio' AND (storage.foldername(name))[1] = auth.uid()::text);