-- Soft-delete an entire job: marks job + its video assets as deleted.
-- Returns array of storage_paths so the caller can purge files from Storage.
CREATE OR REPLACE FUNCTION public.generator_delete_job(_user_id uuid, _job_id uuid)
RETURNS TABLE(storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _job_id IS NULL THEN
    RAISE EXCEPTION 'user_id and job_id required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.generator_generation_jobs
    WHERE id = _job_id AND user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'job not found for user';
  END IF;

  RETURN QUERY
  UPDATE public.generator_video_assets v
     SET deleted_at = now(), updated_at = now()
   WHERE v.job_id = _job_id
     AND v.user_id = _user_id
     AND v.deleted_at IS NULL
  RETURNING v.storage_path;

  UPDATE public.generator_generation_jobs
     SET deleted_at = now(), updated_at = now()
   WHERE id = _job_id AND user_id = _user_id;
END;
$function$;

-- Hide soft-deleted jobs from list/get queries by tightening RLS.
DROP POLICY IF EXISTS "jobs: users select own" ON public.generator_generation_jobs;
CREATE POLICY "jobs: users select own"
ON public.generator_generation_jobs
FOR SELECT
TO authenticated
USING (user_id = auth.uid() AND deleted_at IS NULL);