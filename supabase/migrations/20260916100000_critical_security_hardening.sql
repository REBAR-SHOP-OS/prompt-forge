-- Critical security hardening: generation jobs are backend-owned state.
-- Authenticated clients retain read access through existing SELECT policies,
-- but may no longer create or mutate rows that can trigger provider dispatch.

DROP POLICY IF EXISTS "jobs: users insert own" ON public.generator_generation_jobs;
DROP POLICY IF EXISTS "jobs: users update own non-terminal" ON public.generator_generation_jobs;

REVOKE INSERT, UPDATE, DELETE ON public.generator_generation_jobs FROM authenticated;
GRANT SELECT ON public.generator_generation_jobs TO authenticated;
GRANT ALL ON public.generator_generation_jobs TO service_role;
