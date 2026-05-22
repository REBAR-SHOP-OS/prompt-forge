
-- Attach the existing guard so users cannot mutate sensitive job fields
-- (status, provider_key, model_key, provider_job_id, user_id, deleted_at)
-- via the client even though the row-level UPDATE policy allows the row.
DROP TRIGGER IF EXISTS guard_generation_job_updates ON public.generator_generation_jobs;
CREATE TRIGGER guard_generation_job_updates
BEFORE UPDATE ON public.generator_generation_jobs
FOR EACH ROW
EXECUTE FUNCTION public.guard_generation_job_updates();

-- Also attach the profile guard if it isn't already wired up (defence in depth
-- for the credits_balance / email columns).
DROP TRIGGER IF EXISTS guard_profile_updates ON public.core_user_profiles;
CREATE TRIGGER guard_profile_updates
BEFORE UPDATE ON public.core_user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_updates();
