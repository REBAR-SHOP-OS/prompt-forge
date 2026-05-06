CREATE TABLE public.generator_user_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  width int,
  height int,
  size_bytes int,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.generator_user_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_images: users select own"
  ON public.generator_user_images FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "user_images: users insert own"
  ON public.generator_user_images FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_images: users update own"
  ON public.generator_user_images FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_generator_user_images_user_created
  ON public.generator_user_images (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER set_generator_user_images_updated_at
  BEFORE UPDATE ON public.generator_user_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO storage.buckets (id, name, public)
VALUES ('user-images', 'user-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "user-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'user-images');

CREATE POLICY "user-images: users upload own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "user-images: users update own folder"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'user-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "user-images: users delete own folder"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );