CREATE TABLE public.generator_film_exports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_asset_id uuid NOT NULL,
  source_storage_path text NOT NULL,
  mp4_storage_path text,
  status text NOT NULL DEFAULT 'processing',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generator_film_exports_status_chk CHECK (status IN ('processing','completed','failed')),
  CONSTRAINT generator_film_exports_user_asset_uniq UNIQUE (user_id, source_asset_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generator_film_exports TO authenticated;
GRANT ALL ON public.generator_film_exports TO service_role;

ALTER TABLE public.generator_film_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own film exports"
  ON public.generator_film_exports FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own film exports"
  ON public.generator_film_exports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own film exports"
  ON public.generator_film_exports FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own film exports"
  ON public.generator_film_exports FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER set_generator_film_exports_updated_at
  BEFORE UPDATE ON public.generator_film_exports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();