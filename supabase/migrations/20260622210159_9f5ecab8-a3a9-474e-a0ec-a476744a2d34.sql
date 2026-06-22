ALTER TABLE public.generator_generation_jobs ADD COLUMN IF NOT EXISTS narration_text text;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generator_generation_jobs TO authenticated;
GRANT ALL ON public.generator_generation_jobs TO service_role;