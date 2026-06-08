CREATE OR REPLACE FUNCTION public.generator_start_job(_user_id uuid, _prompt text, _provider_key text, _model_key text, _cost integer)
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
  -- Allow zero-cost jobs (e.g. Local RTX models). Only normalize NULL/negative.
  IF _cost IS NULL OR _cost < 0 THEN _cost := 0; END IF;

  -- Duplicate guard
  SELECT EXISTS(
    SELECT 1 FROM public.generator_generation_jobs
    WHERE user_id = _user_id
      AND input_prompt = _prompt
      AND created_at > now() - interval '60 seconds'
      AND status IN ('pending'::job_status, 'processing'::job_status)
  ) INTO _duplicate;
  IF _duplicate THEN
    RAISE EXCEPTION 'duplicate_job: an identical request was just submitted (wait 60s)';
  END IF;

  -- Ensure quota row exists
  INSERT INTO public.billing_user_quotas (user_id) VALUES (_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  -- Reset rolled-over counters
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

  -- Debit balance atomically
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

  -- Create job
  INSERT INTO public.generator_generation_jobs (user_id, input_prompt, provider_key, model_key, status)
  VALUES (_user_id, _prompt, _provider_key, _model_key, 'pending')
  RETURNING id INTO _job_id;

  -- Record spend transaction (skip for zero-cost jobs)
  IF _cost > 0 THEN
    INSERT INTO public.billing_credit_transactions (user_id, amount, type, job_id, description)
    VALUES (_user_id, -_cost, 'spend', _job_id,
            format('%s/%s', COALESCE(_provider_key,'?'), COALESCE(_model_key,'?')));
  END IF;

  -- Increment quota counters
  UPDATE public.billing_user_quotas
     SET used_today = used_today + _cost,
         used_this_month = used_this_month + _cost,
         updated_at = now()
   WHERE user_id = _user_id;

  RETURN _job_id;
END;
$function$;