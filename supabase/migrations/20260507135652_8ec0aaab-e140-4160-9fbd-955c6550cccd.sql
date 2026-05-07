CREATE OR REPLACE FUNCTION public.guard_generation_job_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_generation_job_updates ON public.generator_generation_jobs;
CREATE TRIGGER trg_guard_generation_job_updates
  BEFORE UPDATE ON public.generator_generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_generation_job_updates();