CREATE TABLE public.mp4_export_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_bucket text NOT NULL,
  source_path text NOT NULL,
  output_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mp4_export_jobs TO authenticated;
GRANT ALL ON public.mp4_export_jobs TO service_role;

ALTER TABLE public.mp4_export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own export jobs"
ON public.mp4_export_jobs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_mp4_export_jobs_lookup
  ON public.mp4_export_jobs (user_id, source_bucket, source_path);

CREATE TRIGGER set_mp4_export_jobs_updated_at
BEFORE UPDATE ON public.mp4_export_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();