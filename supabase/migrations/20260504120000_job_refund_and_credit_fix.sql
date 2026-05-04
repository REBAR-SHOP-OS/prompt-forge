-- Align credit transaction semantics with the existing enum and
-- add an atomic failure/refund path for generation jobs.

CREATE OR REPLACE FUNCTION public.generator_start_job(
  _user_id uuid,
  _prompt text,
  _provider_key text,
  _model_key text,
  _cost integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _balance integer;
  _job_id uuid;
  _debit integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;
  IF _prompt IS NULL OR length(btrim(_prompt)) = 0 THEN
    RAISE EXCEPTION 'prompt required';
  END IF;

  _debit := GREATEST(_cost, 1);

  SELECT credits_balance INTO _balance
  FROM public.core_user_profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF _balance IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;
  IF _balance < _debit THEN
    RAISE EXCEPTION 'insufficient credits';
  END IF;

  INSERT INTO public.generator_generation_jobs (user_id, input_prompt, provider_key, model_key, status)
  VALUES (_user_id, _prompt, _provider_key, _model_key, 'pending')
  RETURNING id INTO _job_id;

  UPDATE public.core_user_profiles
     SET credits_balance = credits_balance - _debit,
         updated_at = now()
   WHERE id = _user_id;

  INSERT INTO public.billing_credit_transactions (user_id, amount, type, job_id, description)
  VALUES (_user_id, -_debit, 'spend', _job_id, 'job:start');

  RETURN _job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generator_start_job(uuid, text, text, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generator_start_job(uuid, text, text, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.generator_fail_job(
  _user_id uuid,
  _job_id uuid,
  _reason text DEFAULT NULL,
  _refund boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _refund_amount integer;
  _already_refunded boolean;
BEGIN
  UPDATE public.generator_generation_jobs
     SET status = 'failed',
         updated_at = now()
   WHERE id = _job_id
     AND user_id = _user_id
     AND status NOT IN ('completed', 'failed', 'cancelled');

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT _refund THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.billing_credit_transactions
    WHERE job_id = _job_id
      AND type = 'refund'
  ) INTO _already_refunded;

  IF _already_refunded THEN
    RETURN;
  END IF;

  SELECT ABS(amount)
    INTO _refund_amount
  FROM public.billing_credit_transactions
  WHERE job_id = _job_id
    AND type = 'spend'
  ORDER BY created_at ASC
  LIMIT 1;

  IF _refund_amount IS NULL OR _refund_amount <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.core_user_profiles
     SET credits_balance = credits_balance + _refund_amount,
         updated_at = now()
   WHERE id = _user_id;

  INSERT INTO public.billing_credit_transactions (user_id, amount, type, job_id, description)
  VALUES (_user_id, _refund_amount, 'refund', _job_id, COALESCE(_reason, 'job:failed'));
END;
$$;

REVOKE ALL ON FUNCTION public.generator_fail_job(uuid, uuid, text, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generator_fail_job(uuid, uuid, text, boolean) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_refund_unique_per_job
ON public.billing_credit_transactions (job_id, type)
WHERE type = 'refund';
