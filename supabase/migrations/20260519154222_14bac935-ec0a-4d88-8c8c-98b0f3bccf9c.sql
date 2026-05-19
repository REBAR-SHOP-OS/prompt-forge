-- Recover the three recent Veo extension jobs that failed because of the now-fixed
-- unsupported `numberOfVideos` parameter. The update is narrowly scoped by id,
-- provider, requested duration, current status, and Veo state encoding.
ALTER TABLE public.generator_generation_jobs DISABLE TRIGGER trg_guard_generation_job_updates;

UPDATE public.generator_generation_jobs
SET status = 'processing',
    updated_at = now()
WHERE id IN (
  '210b30d8-d5b0-481d-8d79-db4ee722dd65'::uuid,
  'a8af5de6-3337-4588-ba09-3cd7dc3e592a'::uuid,
  '8b22a5dd-d210-4bf4-9208-7fd7ad448f86'::uuid
)
  AND status = 'failed'
  AND provider_key = 'flow'
  AND requested_duration = 15
  AND provider_job_id LIKE 'veo:v1:%';

ALTER TABLE public.generator_generation_jobs ENABLE TRIGGER trg_guard_generation_job_updates;