CREATE OR REPLACE FUNCTION public.generator_set_draft_group(
  _user_id uuid,
  _group_id uuid,
  _job_ids uuid[],
  _image_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _group_id IS NULL THEN
    RAISE EXCEPTION 'group_id required';
  END IF;

  IF _job_ids IS NOT NULL AND array_length(_job_ids, 1) > 0 THEN
    UPDATE public.generator_generation_jobs
       SET draft_group_id = _group_id, updated_at = now()
     WHERE user_id = _user_id
       AND id = ANY(_job_ids)
       AND draft_group_id IS DISTINCT FROM _group_id;
  END IF;

  IF _image_ids IS NOT NULL AND array_length(_image_ids, 1) > 0 THEN
    UPDATE public.generator_user_images
       SET draft_group_id = _group_id, updated_at = now()
     WHERE user_id = _user_id
       AND id = ANY(_image_ids)
       AND draft_group_id IS DISTINCT FROM _group_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.generator_set_draft_group(uuid, uuid, uuid[], uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generator_set_draft_group(uuid, uuid, uuid[], uuid[]) TO authenticated, service_role;