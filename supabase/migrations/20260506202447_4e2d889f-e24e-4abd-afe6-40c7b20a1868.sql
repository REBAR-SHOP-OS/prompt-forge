-- Overlays table
CREATE TABLE public.generator_clip_overlays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  clip_kind text NOT NULL CHECK (clip_kind IN ('video','image')),
  clip_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('text','image')),
  x numeric NOT NULL DEFAULT 0.5,
  y numeric NOT NULL DEFAULT 0.5,
  scale numeric NOT NULL DEFAULT 0.2,
  rotation numeric NOT NULL DEFAULT 0,
  z_index integer NOT NULL DEFAULT 0,
  text_value text,
  font_family text,
  font_weight integer,
  color text,
  bg_color text,
  text_align text,
  image_path text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_clip_overlays_user_clip
  ON public.generator_clip_overlays (user_id, clip_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.generator_clip_overlays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overlays: users select own"
  ON public.generator_clip_overlays
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "overlays: users insert own"
  ON public.generator_clip_overlays
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "overlays: users update own"
  ON public.generator_clip_overlays
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_clip_overlays_updated_at
  BEFORE UPDATE ON public.generator_clip_overlays
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket for overlay images
INSERT INTO storage.buckets (id, name, public)
VALUES ('overlay-assets', 'overlay-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "overlay-assets: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'overlay-assets');

CREATE POLICY "overlay-assets: users upload own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'overlay-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "overlay-assets: users update own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'overlay-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "overlay-assets: users delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'overlay-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );