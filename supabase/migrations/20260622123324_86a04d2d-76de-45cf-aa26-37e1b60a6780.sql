-- 1) Lock down direct client UPDATEs on generation jobs.
-- All legitimate job mutations happen through SECURITY DEFINER RPCs and
-- service-role edge functions (which bypass RLS). Clients never need direct
-- UPDATE access, so the previously permissive policy (which allowed overwriting
-- server-controlled fields such as status/provider_key/model_key) is replaced
-- with an explicit deny.
DROP POLICY IF EXISTS "jobs: users update own non-terminal" ON public.generator_generation_jobs;

CREATE POLICY "jobs: deny client update"
  ON public.generator_generation_jobs
  FOR UPDATE
  USING (false)
  WITH CHECK (false);

-- 2) Make mp4-exports bucket write-deny explicit for clients.
-- Only the service role (which bypasses RLS) writes exports; clients read via
-- the existing SELECT policy. Restrictive policies guarantee no authenticated
-- client can INSERT/UPDATE/DELETE in this bucket, regardless of other policies.
CREATE POLICY "mp4-exports: deny client insert"
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id <> 'mp4-exports');

CREATE POLICY "mp4-exports: deny client update"
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (bucket_id <> 'mp4-exports');

CREATE POLICY "mp4-exports: deny client delete"
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (bucket_id <> 'mp4-exports');