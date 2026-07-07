-- Harden generator_business_profiles: replace broad ALL policy with granular owner-scoped policies
DROP POLICY IF EXISTS "Users manage own business profile" ON public.generator_business_profiles;

CREATE POLICY "business_profiles: users select own"
ON public.generator_business_profiles
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "business_profiles: users insert own"
ON public.generator_business_profiles
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "business_profiles: users update own"
ON public.generator_business_profiles
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "business_profiles: users delete own"
ON public.generator_business_profiles
FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Harden generator_copyright_reviews: explicitly deny client UPDATE/DELETE (service_role bypasses RLS)
CREATE POLICY "reviews: no client update"
ON public.generator_copyright_reviews
AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (false);

CREATE POLICY "reviews: no client delete"
ON public.generator_copyright_reviews
AS RESTRICTIVE
FOR DELETE TO authenticated
USING (false);