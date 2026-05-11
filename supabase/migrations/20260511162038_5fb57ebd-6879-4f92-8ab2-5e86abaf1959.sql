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
  DELETE FROM public.generator_video_assets v
   WHERE v.job_id = _job_id
     AND v.user_id = _user_id
  RETURNING v.storage_path;

  DELETE FROM public.generator_generation_jobs
   WHERE id = _job_id AND user_id = _user_id;
END;
$function$;