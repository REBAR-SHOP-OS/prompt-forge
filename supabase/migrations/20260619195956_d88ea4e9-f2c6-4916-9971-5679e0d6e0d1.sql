ALTER TABLE public.generator_copyright_reviews
  DROP CONSTRAINT IF EXISTS generator_copyright_reviews_job_id_fkey;

ALTER TABLE public.generator_copyright_reviews
  ALTER COLUMN job_id TYPE text USING job_id::text;