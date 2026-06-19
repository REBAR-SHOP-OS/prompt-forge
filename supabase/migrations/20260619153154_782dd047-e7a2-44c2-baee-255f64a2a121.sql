INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM public.core_user_profiles
WHERE email IN ('radin@rebar.shop','sattar@rebar.shop')
ON CONFLICT (user_id, role) DO NOTHING;