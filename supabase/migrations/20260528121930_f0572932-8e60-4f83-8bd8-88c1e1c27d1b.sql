CREATE OR REPLACE FUNCTION public.guard_generation_job_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'status can only be modified by admin or backend';
  END IF;
  IF NEW.provider_job_id IS DISTINCT FROM OLD.provider_job_id THEN
    RAISE EXCEPTION 'provider_job_id can only be modified by admin or backend';
  END IF;
  IF NEW.provider_key IS DISTINCT FROM OLD.provider_key THEN
    RAISE EXCEPTION 'provider_key can only be modified by admin or backend';
  END IF;
  IF NEW.model_key IS DISTINCT FROM OLD.model_key THEN
    RAISE EXCEPTION 'model_key can only be modified by admin or backend';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id cannot be modified';
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'deleted_at can only be modified by admin or backend';
  END IF;
  IF NEW.input_prompt IS DISTINCT FROM OLD.input_prompt THEN
    RAISE EXCEPTION 'input_prompt can only be modified by admin or backend';
  END IF;
  IF NEW.negative_prompt IS DISTINCT FROM OLD.negative_prompt THEN
    RAISE EXCEPTION 'negative_prompt can only be modified by admin or backend';
  END IF;
  IF NEW.first_frame_url IS DISTINCT FROM OLD.first_frame_url THEN
    RAISE EXCEPTION 'first_frame_url can only be modified by admin or backend';
  END IF;
  IF NEW.last_frame_url IS DISTINCT FROM OLD.last_frame_url THEN
    RAISE EXCEPTION 'last_frame_url can only be modified by admin or backend';
  END IF;
  IF NEW.requested_duration IS DISTINCT FROM OLD.requested_duration THEN
    RAISE EXCEPTION 'requested_duration can only be modified by admin or backend';
  END IF;
  IF NEW.requested_aspect_ratio IS DISTINCT FROM OLD.requested_aspect_ratio THEN
    RAISE EXCEPTION 'requested_aspect_ratio can only be modified by admin or backend';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at cannot be modified';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_generation_job_updates_trg ON public.generator_generation_jobs;
CREATE TRIGGER guard_generation_job_updates_trg
  BEFORE UPDATE ON public.generator_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_generation_job_updates();