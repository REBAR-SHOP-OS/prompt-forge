ALTER TABLE public.generator_user_images
  ADD COLUMN IF NOT EXISTS still_duration_seconds integer NOT NULL DEFAULT 3;