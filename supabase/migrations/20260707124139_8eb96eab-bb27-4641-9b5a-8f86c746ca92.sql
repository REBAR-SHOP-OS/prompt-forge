CREATE OR REPLACE FUNCTION public.generator_start_job_v2(_user_id uuid, _prompt text, _provider_key text, _model_key text, _cost integer, _client_request_id uuid DEFAULT NULL::uuid, _first_frame_url text DEFAULT NULL::text, _last_frame_url text DEFAULT NULL::text, _reference_image_urls text[] DEFAULT NULL::text[], _requested_aspect_ratio text DEFAULT NULL::text, _requested_duration integer DEFAULT NULL::integer, _draft_group_id uuid DEFAULT NULL::uuid, _narration_text text DEFAULT NULL::text)
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
  -- Fail fast instead of hanging the whole request (previously up to the
  -- client's 120s timeout) when this user's profile/quota rows are momentarily
  -- locked by another in-flight create for the same user. The caller maps the
  -- resulting error to a clean, retryable message.
  SET LOCAL lock_timeout = '8s';
  SET LOCAL statement_timeout = '20s';
  SET LOCAL idle_in_transaction_session_timeout = '30s';

  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;
  IF _prompt IS NULL OR length(btrim(_prompt)) = 0 THEN RAISE EXCEPTION 'prompt required'; END IF;
  IF _cost IS NULL OR _cost < 0 THEN _cost := 0; END IF;

  IF _client_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _client_request_id::text, 0));

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