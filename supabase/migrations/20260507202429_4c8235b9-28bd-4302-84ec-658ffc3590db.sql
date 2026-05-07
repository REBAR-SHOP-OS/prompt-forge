
-- Disable credit checks/debits in job start. Keep tables intact for history.
CREATE OR REPLACE FUNCTION public.generator_start_job(_user_id uuid, _prompt text, _provider_key text, _model_key text, _cost integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _job_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;
  IF _prompt IS NULL OR length(btrim(_prompt)) = 0 THEN
    RAISE EXCEPTION 'prompt required';
  END IF;

  INSERT INTO public.generator_generation_jobs (user_id, input_prompt, provider_key, model_key, status)
  VALUES (_user_id, _prompt, _provider_key, _model_key, 'pending')
  RETURNING id INTO _job_id;

  RETURN _job_id;
END;
$function$;
