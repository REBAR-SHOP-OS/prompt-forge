ALTER TABLE public.generator_generation_jobs ADD COLUMN IF NOT EXISTS draft_group_id uuid;
ALTER TABLE public.generator_user_images ADD COLUMN IF NOT EXISTS draft_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_draft_group
  ON public.generator_generation_jobs (user_id, draft_group_id);
CREATE INDEX IF NOT EXISTS idx_user_images_user_draft_group
  ON public.generator_user_images (user_id, draft_group_id);