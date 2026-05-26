
-- 1) Quota table
CREATE TABLE public.billing_user_quotas (
  user_id uuid PRIMARY KEY,
  daily_limit_credits int NOT NULL DEFAULT 1500,
  monthly_limit_credits int NOT NULL DEFAULT 30000,
  used_today int NOT NULL DEFAULT 0,
  used_this_month int NOT NULL DEFAULT 0,
  last_reset_day date NOT NULL DEFAULT current_date,
  last_reset_month date NOT NULL DEFAULT date_trunc('month', current_date)::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.billing_user_quotas TO authenticated;
GRANT ALL ON public.billing_user_quotas TO service_role;

ALTER TABLE public.billing_user_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotas: users select own"
  ON public.billing_user_quotas FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "quotas: admins select all"
  ON public.billing_user_quotas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "quotas: deny client insert"
  ON public.billing_user_quotas AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "quotas: deny client update"
  ON public.billing_user_quotas AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "quotas: deny client delete"
  ON public.billing_user_quotas AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

CREATE INDEX idx_jobs_user_created ON public.generator_generation_jobs (user_id, created_at DESC);
CREATE INDEX idx_api_logs_user_created ON public.audit_api_request_logs (user_id, created_at DESC);
CREATE INDEX idx_api_logs_provider_created ON public.audit_api_request_logs (provider_key, created_at DESC);

-- 2) Rewrite start_job: duplicate guard + quota + atomic debit
CREATE OR REPLACE FUNCTION public.generator_start_job(
  _user_id uuid, _prompt text, _provider_key text, _model_key text, _cost integer
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
  IF _cost IS NULL OR _cost < 1 THEN _cost := 1; END IF;

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

  UPDATE public.core_user_profiles
     SET credits_balance = credits_balance - _cost, updated_at = now()
   WHERE id = _user_id;

  -- Create job
  INSERT INTO public.generator_generation_jobs (user_id, input_prompt, provider_key, model_key, status)
  VALUES (_user_id, _prompt, _provider_key, _model_key, 'pending')
  RETURNING id INTO _job_id;

  -- Record spend transaction
  INSERT INTO public.billing_credit_transactions (user_id, amount, type, job_id, description)
  VALUES (_user_id, -_cost, 'spend', _job_id,
          format('%s/%s', COALESCE(_provider_key,'?'), COALESCE(_model_key,'?')));

  -- Increment quota counters
  UPDATE public.billing_user_quotas
     SET used_today = used_today + _cost,
         used_this_month = used_this_month + _cost,
         updated_at = now()
   WHERE user_id = _user_id;

  RETURN _job_id;
END;
$$;

-- 3) Admin: set per-user quota
CREATE OR REPLACE FUNCTION public.admin_set_user_quota(
  _user_id uuid, _daily int, _monthly int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF _daily IS NULL OR _daily < 0 OR _monthly IS NULL OR _monthly < 0 THEN
    RAISE EXCEPTION 'invalid limits';
  END IF;

  INSERT INTO public.billing_user_quotas (user_id, daily_limit_credits, monthly_limit_credits)
    VALUES (_user_id, _daily, _monthly)
    ON CONFLICT (user_id) DO UPDATE
      SET daily_limit_credits = EXCLUDED.daily_limit_credits,
          monthly_limit_credits = EXCLUDED.monthly_limit_credits,
          updated_at = now();
END;
$$;

-- 4) Admin: aggregated cost summary
CREATE OR REPLACE FUNCTION public.admin_cost_summary()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT jsonb_build_object(
    'totals_by_provider', COALESCE((
      SELECT jsonb_agg(t)
      FROM (
        SELECT provider_key,
               COALESCE(SUM(estimated_cost) FILTER (WHERE created_at > now() - interval '1 day'), 0)::numeric AS today_usd,
               COALESCE(SUM(estimated_cost) FILTER (WHERE created_at > now() - interval '7 days'), 0)::numeric AS week_usd,
               COALESCE(SUM(estimated_cost) FILTER (WHERE created_at > now() - interval '30 days'), 0)::numeric AS month_usd,
               COUNT(*) FILTER (WHERE created_at > now() - interval '1 day' AND status_code < 400) AS jobs_today
        FROM public.audit_api_request_logs
        WHERE provider_key IS NOT NULL
        GROUP BY provider_key
        ORDER BY 4 DESC
      ) t
    ), '[]'::jsonb),
    'top_users', COALESCE((
      SELECT jsonb_agg(u)
      FROM (
        SELECT l.user_id,
               p.email,
               COALESCE(SUM(l.estimated_cost), 0)::numeric AS spent_30d_usd,
               COUNT(*) AS calls_30d,
               q.daily_limit_credits,
               q.monthly_limit_credits,
               q.used_today,
               q.used_this_month
        FROM public.audit_api_request_logs l
        LEFT JOIN public.core_user_profiles p ON p.id = l.user_id
        LEFT JOIN public.billing_user_quotas q ON q.user_id = l.user_id
        WHERE l.user_id IS NOT NULL
          AND l.created_at > now() - interval '30 days'
          AND l.provider_key IS NOT NULL
        GROUP BY l.user_id, p.email, q.daily_limit_credits, q.monthly_limit_credits, q.used_today, q.used_this_month
        ORDER BY SUM(l.estimated_cost) DESC NULLS LAST
        LIMIT 25
      ) u
    ), '[]'::jsonb),
    'generated_at', now()
  ) INTO result;

  RETURN result;
END;
$$;
