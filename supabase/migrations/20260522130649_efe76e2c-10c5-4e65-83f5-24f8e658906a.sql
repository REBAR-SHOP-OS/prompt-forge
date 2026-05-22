ALTER TABLE public.generator_generation_jobs
  DROP CONSTRAINT IF EXISTS generator_generation_jobs_provider_job_id_key;

DROP INDEX IF EXISTS public.idx_gen_jobs_provider_job_id;
DROP INDEX IF EXISTS public.generator_generation_jobs_provider_job_id_key;