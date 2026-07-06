-- Scope business profile policy to authenticated role
DROP POLICY IF EXISTS "Users manage own business profile" ON public.generator_business_profiles;
CREATE POLICY "Users manage own business profile"
  ON public.generator_business_profiles
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Scope generation jobs update-denial policy consistently (as delete policy)
DROP POLICY IF EXISTS "jobs: deny client update" ON public.generator_generation_jobs;
CREATE POLICY "jobs: deny client update"
  ON public.generator_generation_jobs
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);