DROP POLICY IF EXISTS "Public read merged-videos" ON storage.objects;

DROP POLICY IF EXISTS "jobs: users update own non-terminal" ON public.generator_generation_jobs;
CREATE POLICY "jobs: users update own non-terminal"
ON public.generator_generation_jobs
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND deleted_at IS NULL
  AND status <> ALL (ARRAY['completed'::job_status, 'failed'::job_status, 'cancelled'::job_status])
)
WITH CHECK (user_id = auth.uid());

CREATE POLICY "jobs: deny client delete"
ON public.generator_generation_jobs
AS RESTRICTIVE
FOR DELETE TO anon, authenticated
USING (false);

DROP POLICY IF EXISTS "profiles: users update own" ON public.core_user_profiles;
CREATE POLICY "profiles: users update own"
ON public.core_user_profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.credits_balance IS DISTINCT FROM OLD.credits_balance
     AND auth.role() <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'credits_balance can only be modified by admin or backend';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email
     AND auth.role() <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'email can only be modified by admin or backend';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     AND auth.role() <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'id cannot be modified';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_profile_updates_trg ON public.core_user_profiles;
CREATE TRIGGER guard_profile_updates_trg
BEFORE UPDATE ON public.core_user_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_updates();