ALTER TABLE public.generator_generation_jobs
  ADD COLUMN IF NOT EXISTS parent_final_job_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_generator_jobs_parent_final
  ON public.generator_generation_jobs (parent_final_job_id);

CREATE OR REPLACE FUNCTION public.generator_finalize_film(
  _user_id uuid,
  _storage_path text,
  _aspect_ratio text,
  _duration integer,
  _clip_count integer,
  _source_job_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _job_id uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;
  IF _storage_path IS NULL OR length(btrim(_storage_path)) = 0 THEN
    RAISE EXCEPTION 'storage_path required';
  END IF;

  INSERT INTO public.generator_generation_jobs
    (user_id, input_prompt, provider_key, model_key, status, requested_aspect_ratio)
  VALUES
    (_user_id,
     format('Final Film (%s clip%s)', COALESCE(_clip_count,0),
            CASE WHEN COALESCE(_clip_count,0) = 1 THEN '' ELSE 's' END),
     'final-film', 'merge', 'completed', _aspect_ratio)
  RETURNING id INTO _job_id;

  INSERT INTO public.generator_video_assets
    (user_id, job_id, storage_path, thumbnail_url, aspect_ratio, duration)
  VALUES
    (_user_id, _job_id, _storage_path, NULL, _aspect_ratio, _duration);

  IF _source_job_ids IS NOT NULL AND array_length(_source_job_ids, 1) > 0 THEN
    UPDATE public.generator_generation_jobs
       SET parent_final_job_id = _job_id, updated_at = now()
     WHERE user_id = _user_id
       AND id = ANY(_source_job_ids)
       AND provider_key IS DISTINCT FROM 'final-film';
  END IF;

  RETURN _job_id;
END;
$function$;