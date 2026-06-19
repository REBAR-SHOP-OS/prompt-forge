CREATE TABLE public.generator_copyright_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.generator_generation_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.core_user_profiles(id) ON DELETE CASCADE,
  verdict text NOT NULL,
  video_status text,
  music_status text,
  summary text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (job_id)
);

GRANT SELECT ON public.generator_copyright_reviews TO authenticated;
GRANT ALL ON public.generator_copyright_reviews TO service_role;

ALTER TABLE public.generator_copyright_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews: users select own"
  ON public.generator_copyright_reviews
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "reviews: admins select all"
  ON public.generator_copyright_reviews
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_copyright_reviews_updated
  BEFORE UPDATE ON public.generator_copyright_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();