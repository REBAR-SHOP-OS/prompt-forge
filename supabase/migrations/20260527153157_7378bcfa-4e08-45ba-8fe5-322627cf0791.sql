
-- 1) core_ai_provider_registry: add restrictive deny policies for non-admins on write ops
CREATE POLICY "providers: deny non-admin insert"
ON public.core_ai_provider_registry
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "providers: deny non-admin update"
ON public.core_ai_provider_registry
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "providers: deny non-admin delete"
ON public.core_ai_provider_registry
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) core_user_profiles: replace tautological restrictive policy with a correct one
DROP POLICY IF EXISTS "profiles: deny client sensitive updates" ON public.core_user_profiles;

CREATE POLICY "profiles: deny client sensitive updates"
ON public.core_user_profiles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR id = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    id = auth.uid()
    AND credits_balance = (SELECT p.credits_balance FROM public.core_user_profiles p WHERE p.id = auth.uid())
    AND email = (SELECT p.email FROM public.core_user_profiles p WHERE p.id = auth.uid())
  )
);
