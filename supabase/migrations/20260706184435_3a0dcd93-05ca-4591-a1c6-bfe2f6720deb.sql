REVOKE EXECUTE ON FUNCTION public.generator_start_job_v2(uuid, text, text, text, integer, uuid, text, text, text[], text, integer, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generator_claim_provider_start(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generator_record_provider_start_error(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generator_start_job_v2(uuid, text, text, text, integer, uuid, text, text, text[], text, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.generator_claim_provider_start(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generator_record_provider_start_error(uuid, uuid, text) TO service_role;