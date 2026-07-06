ALTER TABLE public.generator_generation_jobs
  ADD COLUMN IF NOT EXISTS client_request_id uuid,
  ADD COLUMN IF NOT EXISTS provider_start_claimed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS provider_start_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_start_last_error text;

CREATE UNIQUE INDEX IF NOT EXISTS generator_generation_jobs_user_client_request_uidx
  ON public.generator_generation_jobs(user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gen_jobs_provider_start_recovery
  ON public.generator_generation_jobs(user_id, status, provider_job_id, provider_start_claimed_at)
  WHERE status IN ('pending', 'processing') AND provider_job_id IS NULL;

CREATE OR REPLACE FUNCTION public.generator_start_job_v2(
  _user_id uuid,
  _prompt text,
  _provider_key text,
  _model_key text,
  _cost integer,
  _client_request_id uuid DEFAULT NULL,
  _first_frame_url text DEFAULT NULL,
  _last_frame_url text DEFAULT NULL,
  _reference_image_urls text[] DEFAULT NULL,
  _requested_aspect_ratio text DEFAULT NULL,
  _requested_duration integer DEFAULT NULL,
  _draft_group_id uuid DEFAULT NULL,
  _narration_text text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _job_id uuid;
  _quota record;
  _today date := current_date;
  _month date := date_trunc('month', current_date)::date;
  _balance int;
  _duplicate boolean;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;
  IF _prompt IS NULL OR length(btrim(_prompt)) = 0 THEN RAISE EXCEPTION 'prompt required'; END IF;
  IF _cost IS NULL OR _cost < 0 THEN _cost := 0; END IF;

  IF _client_request_id IS NOT NULL THEN
    SELECT id INTO _job_id
    FROM public.generator_generation_jobs
    WHERE user_id = _user_id
      AND client_request_id = _client_request_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF _job_id IS NOT NULL THEN
      RETURN _job_id;
    END IF;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.generator_generation_jobs
    WHERE user_id = _user_id
      AND input_prompt = _prompt
      AND created_at > now() - interval '60 seconds'
      AND status IN ('pending'::job_status, 'processing'::job_status)
      AND (_client_request_id IS NULL OR client_request_id IS DISTINCT FROM _client_request_id)
  ) INTO _duplicate;
  IF _duplicate THEN
    RAISE EXCEPTION 'duplicate_job: an identical request was just submitted (wait 60s)';
  END IF;

  INSERT INTO public.billing_user_quotas (user_id) VALUES (_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.billing_user_quotas
     SET used_today = CASE WHEN last_reset_day < _today THEN 0 ELSE used_today END,
         last_reset_day = _today,
         used_this_month = CASE WHEN last_reset_month < _month THEN 0 ELSE used_this_month END,
         last_reset_month = _month
   WHERE user_id = _user_id;

  SELECT * INTO _quota FROM public.billing_user_quotas WHERE user_id = _user_id FOR UPDATE;

  IF _quota.used_today + _cost > _quota.daily_limit_credits THEN
    RAISE EXCEPTION 'quota_exceeded_daily: % of % credits used today (need % more)',
      _quota.used_today, _quota.daily_limit_credits, _cost;
  END IF;
  IF _quota.used_this_month + _cost > _quota.monthly_limit_credits THEN
    RAISE EXCEPTION 'quota_exceeded_monthly: % of % credits used this month (need % more)',
      _quota.used_this_month, _quota.monthly_limit_credits, _cost;
  END IF;

  SELECT credits_balance INTO _balance FROM public.core_user_profiles
    WHERE id = _user_id FOR UPDATE;
  IF _balance IS NULL THEN RAISE EXCEPTION 'user profile missing'; END IF;
  IF _balance < _cost THEN
    RAISE EXCEPTION 'insufficient_credits: balance % < cost %', _balance, _cost;
  END IF;

  IF _cost > 0 THEN
    UPDATE public.core_user_profiles
       SET credits_balance = credits_balance - _cost, updated_at = now()
     WHERE id = _user_id;
  END IF;

  INSERT INTO public.generator_generation_jobs (
    user_id,
    input_prompt,
    provider_key,
    model_key,
    status,
    client_request_id,
    first_frame_url,
    last_frame_url,
    reference_image_urls,
    requested_aspect_ratio,
    requested_duration,
    draft_group_id,
    narration_text
  )
  VALUES (
    _user_id,
    _prompt,
    _provider_key,
    _model_key,
    'pending',
    _client_request_id,
    _first_frame_url,
    _last_frame_url,
    CASE WHEN _reference_image_urls IS NULL OR array_length(_reference_image_urls, 1) IS NULL THEN NULL ELSE _reference_image_urls END,
    _requested_aspect_ratio,
    _requested_duration,
    _draft_group_id,
    _narration_text
  )
  RETURNING id INTO _job_id;

  IF _cost > 0 THEN
    INSERT INTO public.billing_credit_transactions (user_id, amount, type, job_id, description)
    VALUES (_user_id, -_cost, 'spend', _job_id,
            format('%s/%s', COALESCE(_provider_key,'?'), COALESCE(_model_key,'?')));
  END IF;

  UPDATE public.billing_user_quotas
     SET used_today = used_today + _cost,
         used_this_month = used_this_month + _cost,
         updated_at = now()
   WHERE user_id = _user_id;

  RETURN _job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generator_claim_provider_start(
  _user_id uuid,
  _job_id uuid,
  _stale_after_seconds integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.generator_generation_jobs
     SET provider_start_claimed_at = now(),
         provider_start_attempts = provider_start_attempts + 1,
         provider_start_last_error = NULL,
         updated_at = now()
   WHERE id = _job_id
     AND user_id = _user_id
     AND status IN ('pending'::job_status, 'processing'::job_status)
     AND provider_job_id IS NULL
     AND (
       provider_start_claimed_at IS NULL
       OR provider_start_claimed_at < now() - make_interval(secs => GREATEST(COALESCE(_stale_after_seconds, 120), 30))
     );

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generator_record_provider_start_error(
  _user_id uuid,
  _job_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.generator_generation_jobs
     SET provider_start_last_error = left(COALESCE(_reason, 'provider start failed'), 240),
         provider_start_claimed_at = NULL,
         updated_at = now()
   WHERE id = _job_id
     AND user_id = _user_id
     AND provider_job_id IS NULL
     AND status IN ('pending'::job_status, 'processing'::job_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.generator_mark_job_processing(_user_id uuid, _job_id uuid, _provider_job_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.generator_generation_jobs
     SET status = 'processing',
         provider_job_id = COALESCE(_provider_job_id, provider_job_id),
         provider_start_claimed_at = NULL,
         provider_start_last_error = NULL,
         updated_at = now()
   WHERE id = _job_id AND user_id = _user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_generation_job_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'status can only be modified by admin or backend';
  END IF;
  IF NEW.provider_job_id IS DISTINCT FROM OLD.provider_job_id THEN
    RAISE EXCEPTION 'provider_job_id can only be modified by admin or backend';
  END IF;
  IF NEW.provider_key IS DISTINCT FROM OLD.provider_key THEN
    RAISE EXCEPTION 'provider_key can only be modified by admin or backend';
  END IF;
  IF NEW.model_key IS DISTINCT FROM OLD.model_key THEN
    RAISE EXCEPTION 'model_key can only be modified by admin or backend';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id cannot be modified';
  END IF;
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'deleted_at can only be modified by admin or backend';
  END IF;
  IF NEW.input_prompt IS DISTINCT FROM OLD.input_prompt THEN
    RAISE EXCEPTION 'input_prompt can only be modified by admin or backend';
  END IF;
  IF NEW.negative_prompt IS DISTINCT FROM OLD.negative_prompt THEN
    RAISE EXCEPTION 'negative_prompt can only be modified by admin or backend';
  END IF;
  IF NEW.first_frame_url IS DISTINCT FROM OLD.first_frame_url THEN
    RAISE EXCEPTION 'first_frame_url can only be modified by admin or backend';
  END IF;
  IF NEW.last_frame_url IS DISTINCT FROM OLD.last_frame_url THEN
    RAISE EXCEPTION 'last_frame_url can only be modified by admin or backend';
  END IF;
  IF NEW.reference_image_urls IS DISTINCT FROM OLD.reference_image_urls THEN
    RAISE EXCEPTION 'reference_image_urls can only be modified by admin or backend';
  END IF;
  IF NEW.requested_duration IS DISTINCT FROM OLD.requested_duration THEN
    RAISE EXCEPTION 'requested_duration can only be modified by admin or backend';
  END IF;
  IF NEW.requested_aspect_ratio IS DISTINCT FROM OLD.requested_aspect_ratio THEN
    RAISE EXCEPTION 'requested_aspect_ratio can only be modified by admin or backend';
  END IF;
  IF NEW.client_request_id IS DISTINCT FROM OLD.client_request_id THEN
    RAISE EXCEPTION 'client_request_id can only be modified by admin or backend';
  END IF;
  IF NEW.provider_start_claimed_at IS DISTINCT FROM OLD.provider_start_claimed_at THEN
    RAISE EXCEPTION 'provider_start_claimed_at can only be modified by admin or backend';
  END IF;
  IF NEW.provider_start_attempts IS DISTINCT FROM OLD.provider_start_attempts THEN
    RAISE EXCEPTION 'provider_start_attempts can only be modified by admin or backend';
  END IF;
  IF NEW.provider_start_last_error IS DISTINCT FROM OLD.provider_start_last_error THEN
    RAISE EXCEPTION 'provider_start_last_error can only be modified by admin or backend';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at cannot be modified';
  END IF;
  RETURN NEW;
END;
$function$;