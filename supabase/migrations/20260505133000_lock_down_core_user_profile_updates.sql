DROP POLICY IF EXISTS "profiles: users update own" ON public.core_user_profiles;
DROP POLICY IF EXISTS "profiles: admins update all" ON public.core_user_profiles;

COMMENT ON TABLE public.core_user_profiles IS
'User profile rows are readable by the owner/admin, but all writes must go through backend/service-role flows.';
