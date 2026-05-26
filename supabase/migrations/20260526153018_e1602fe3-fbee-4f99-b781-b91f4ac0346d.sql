
REVOKE EXECUTE ON FUNCTION public.generator_start_job(uuid, text, text, text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_quota(uuid, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_cost_summary() FROM anon, authenticated;
