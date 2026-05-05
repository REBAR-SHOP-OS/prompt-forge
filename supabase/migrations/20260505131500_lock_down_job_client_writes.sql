-- Clients must not write generator jobs directly.
-- All creation and state transitions must go through the service-role RPC path
-- so credit debits/refunds and provider orchestration stay atomic.

DROP POLICY IF EXISTS "jobs: users insert own" ON public.generator_generation_jobs;
DROP POLICY IF EXISTS "jobs: users update own non-terminal" ON public.generator_generation_jobs;
