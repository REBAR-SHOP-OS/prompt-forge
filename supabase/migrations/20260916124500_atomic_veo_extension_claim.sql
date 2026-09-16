-- Atomically move a Veo job from a completed phase-one state into a durable
-- extension-dispatch claim before issuing the paid external request.
CREATE OR REPLACE FUNCTION public.generator_claim_veo_extension(
  _user_id uuid,
  _job_id uuid,
  _expected_provider_job_id text,
  _claimed_provider_job_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _job_id IS NULL OR
     NULLIF(_expected_provider_job_id, '') IS NULL OR
     NULLIF(_claimed_provider_job_id, '') IS NULL THEN
    RAISE EXCEPTION 'veo extension claim arguments required';
  END IF;

  UPDATE public.generator_generation_jobs
     SET provider_job_id = _claimed_provider_job_id,
         provider_start_last_error = NULL,
         updated_at = now()
   WHERE id = _job_id
     AND user_id = _user_id
     AND provider_key = 'flow'
     AND status = 'processing'::job_status
     AND provider_job_id = _expected_provider_job_id;

  RETURN FOUND;
END;
$function$;

-- Settle only the exact claim token. A confirmed provider rejection supplies a
-- retry-state id plus an error; a successful dispatch supplies the phase-two
-- operation state. If the worker crashes or the transport result is ambiguous,
-- this function is deliberately not called, leaving the claim non-replayable.
CREATE OR REPLACE FUNCTION public.generator_settle_veo_extension(
  _user_id uuid,
  _job_id uuid,
  _claimed_provider_job_id text,
  _next_provider_job_id text,
  _last_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _job_id IS NULL OR
     NULLIF(_claimed_provider_job_id, '') IS NULL OR
     NULLIF(_next_provider_job_id, '') IS NULL THEN
    RAISE EXCEPTION 'veo extension settle arguments required';
  END IF;

  UPDATE public.generator_generation_jobs
     SET provider_job_id = _next_provider_job_id,
         provider_start_last_error = CASE
           WHEN _last_error IS NULL THEN NULL
           ELSE left(_last_error, 240)
         END,
         updated_at = now()
   WHERE id = _job_id
     AND user_id = _user_id
     AND provider_key = 'flow'
     AND status = 'processing'::job_status
     AND provider_job_id = _claimed_provider_job_id;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.generator_claim_veo_extension(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generator_settle_veo_extension(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generator_claim_veo_extension(uuid, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.generator_settle_veo_extension(uuid, uuid, text, text, text)
  TO service_role;
